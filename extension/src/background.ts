/**
 * Service worker.
 * Routes messages between the content script and the side panel, and talks to Copilot Studio
 * directly over its Direct Line REST API (see background/copilot.ts) - there is no backend
 * server anywhere in this picture. Everything here runs inside the extension itself.
 */
import { PRODUCT_NAME, SHORT_NAME } from './shared/config';
import { fetchWeather } from './shared/weather';
import { copilotConfigured, ocrWithCopilot, routeAction } from './background/copilot';
import type { ActiveTabContext, BgResponse, ExtMessage, OcrResult, PageContext } from './shared/types';

const MENU_SELECTION = 'orbit-ask-selection';
const MENU_PAGE = 'orbit-open-panel';
const EDIT_KEY = 'orbit.editWidget';

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  // We open the panel ourselves (see action.onClicked below) so we can first re-enable it for
  // the tab in case a widget placement closed it - openPanelOnActionClick would bypass that.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: `${SHORT_NAME}: Assist with “%s”`,
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: `${SHORT_NAME}: Open ${PRODUCT_NAME.slice(SHORT_NAME.length).trim() || PRODUCT_NAME}`,
      contexts: ['page'],
    });
  });
});

/** Tracks whether we last opened or closed the panel for each tab, so the keyboard shortcut
 *  can toggle it. Best-effort only: Chrome has no API to query the panel's actual open state,
 *  so this can drift if the user closes the panel through Chrome's own UI instead of ours. */
const panelOpenState = new Map<number, boolean>();

/** Re-enable the panel for this tab (a widget placement may have closed it) and open it.
 *  sidePanel.open() only works inside the synchronous span of a user gesture, so this must NOT
 *  `await` setOptions() first - both calls are fired back to back, exactly as Chrome's own samples do. */
function openSidePanelForTab(tabId: number): void {
  panelOpenState.set(tabId, true);
  chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' }).catch(console.error);
  chrome.sidePanel.open({ tabId }).catch(console.error);
}

/** Close the panel for this tab. Re-opened later via the toolbar icon, the keyboard shortcut,
 *  or an "Edit" click on the page. */
function closeSidePanelForTab(tabId: number): void {
  panelOpenState.set(tabId, false);
  chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => undefined);
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) openSidePanelForTab(tab.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id !== undefined) {
    openSidePanelForTab(tab.id);
    if (info.menuItemId === MENU_SELECTION && info.selectionText) {
      void setSelection(tab.id, info.selectionText);
    }
  }
});

// Ctrl+Shift+U (configurable per-user at chrome://extensions/shortcuts): opens the panel if it's
// closed, closes it if it's open. No visible UI for this anywhere - keyboard-only.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-side-panel' || tab?.id === undefined) return;
  const isOpen = panelOpenState.get(tab.id) ?? false;
  if (isOpen) closeSidePanelForTab(tab.id);
  else openSidePanelForTab(tab.id);
});

// Keep the side panel in sync when the user switches / navigates tabs.
chrome.tabs.onActivated.addListener(({ tabId }) => broadcast({ type: 'ORBIT_TAB_CHANGED', tabId }));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) broadcast({ type: 'ORBIT_TAB_CHANGED', tabId });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(selKey(tabId));
  panelOpenState.delete(tabId);
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const selKey = (tabId: number) => `sel:${tabId}`;

async function setSelection(tabId: number, text: string) {
  await chrome.storage.session.set({ [selKey(tabId)]: text });
  broadcast({ type: 'ORBIT_SELECTION_UPDATE', tabId, text });
}

/** Fire-and-forget message to extension pages (side panel). Ignore "no receiver". */
function broadcast(msg: ExtMessage) {
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

const isRestricted = (url: string | undefined) =>
  !url ||
  !/^(https?|file):\/\//i.test(url) ||
  /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url);

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/** Send a message to a tab's content script, injecting it first if the tab pre-dates the extension. */
async function sendToTab<T>(tabId: number, msg: ExtMessage): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  }
}

const askContentScript = (tabId: number) => sendToTab<PageContext>(tabId, { type: 'ORBIT_COLLECT_PAGE' });

/** Forward a side-panel command (widgets, replace text...) to the active tab's content script. */
async function forwardToActiveTab<T>(msg: ExtMessage): Promise<T> {
  const tab = await activeTab();
  if (!tab?.id || isRestricted(tab.url)) {
    throw new Error('Open a normal website tab first - Chrome does not allow extensions on this page.');
  }
  const res = await sendToTab<T & { __error?: string }>(tab.id, msg);
  if (res && typeof res === 'object' && '__error' in res && res.__error) throw new Error(res.__error);
  return res;
}

async function getActiveContext(): Promise<ActiveTabContext> {
  const tab = await activeTab();
  const base = { tabId: tab?.id ?? null, url: tab?.url ?? '', title: tab?.title ?? '' };
  if (!tab?.id || isRestricted(tab.url)) return { ...base, restricted: true, context: null };
  try {
    const context = await askContentScript(tab.id);
    // The context-menu selection (if any) wins when the live selection is empty.
    if (!context.selection) {
      const cached = (await chrome.storage.session.get(selKey(tab.id)))[selKey(tab.id)] as string | undefined;
      if (cached) context.selection = cached;
    }
    return { ...base, title: context.title || base.title, restricted: false, context };
  } catch (err) {
    console.warn(`${SHORT_NAME}: cannot read page`, err);
    return { ...base, restricted: true, context: null };
  }
}

// ----------------------------------------------------------------------------
// Message router
// ----------------------------------------------------------------------------
async function handle(msg: ExtMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'ORBIT_SELECTION_CHANGED': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) await setSelection(tabId, msg.text);
      return null;
    }
    case 'ORBIT_WIDGET_EDIT_REQUEST': {
      // Re-enable + open the panel first (needs the click's user gesture), then tell it which widget to edit.
      const tabId = sender.tab?.id;
      if (tabId !== undefined) openSidePanelForTab(tabId);
      await chrome.storage.session.set({ [EDIT_KEY]: msg.id });
      broadcast({ type: 'ORBIT_WIDGET_EVENT', event: 'edit', id: msg.id });
      return null;
    }
    case 'ORBIT_OPEN_PANEL': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return null;
      openSidePanelForTab(tabId);
      return null;
    }
    case 'ORBIT_WIDGET_EVENT': {
      // Placing a widget is a one-shot setup step - once it's on the page, the panel has nothing
      // left to do there, so close it (just the panel UI - never touches the placed widget
      // itself). It reopens via the toolbar icon on the page, or an "Edit" click on a widget.
      const tabId = sender.tab?.id;
      if (msg.event === 'placed' && tabId !== undefined) closeSidePanelForTab(tabId);
      return null;
    }
    case 'ORBIT_WIDGET_PLACE':
    case 'ORBIT_WIDGET_CANCEL':
    case 'ORBIT_WIDGET_LIST':
    case 'ORBIT_WIDGET_REMOVE':
    case 'ORBIT_WIDGET_UPDATE':
    case 'ORBIT_WIDGET_MOVE':
    case 'ORBIT_WIDGET_DRAG_ARM':
    case 'ORBIT_WIDGET_DRAG_DISARM':
    case 'ORBIT_REPLACE_SELECTION':
    case 'ORBIT_UNDO_REPLACE':
      return forwardToActiveTab(msg);
    case 'ORBIT_GET_CONTEXT':
      return getActiveContext();
    case 'ORBIT_RUN_ACTION':
      return routeAction(msg.payload);
    case 'ORBIT_WEATHER':
      return fetchWeather(msg.location, msg.units);
    case 'ORBIT_CAPTURE_TAB': {
      // screenshot of the visible part of the sender's tab (used by the OCR area selector)
      const windowId = sender.tab?.windowId;
      return chrome.tabs.captureVisibleTab(windowId ?? chrome.windows.WINDOW_ID_CURRENT, { format: 'png' });
    }
    case 'ORBIT_OCR':
      return runOcr(msg.image, msg.engine);
    case 'ORBIT_COPILOT_HEALTH':
      return { configured: copilotConfigured() };
    default:
      // Broadcast messages addressed to the side panel - nothing to do here.
      return undefined;
  }
}

// ----------------------------------------------------------------------------
// OCR: "local" = offline Tesseract inside an offscreen document, "ai" = Copilot Studio vision, called directly
// ----------------------------------------------------------------------------
let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });
  if (contexts.length) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS' as chrome.offscreen.Reason],
      justification: 'Run the offline OCR engine (WebAssembly) in a web worker.',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

const OCR_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/;

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = OCR_DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error('Expected a PNG / JPEG / WebP image as a base64 data URL.');
  const [, mime, b64] = match;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes };
}

async function runOcr(image: string, engine: 'local' | 'ai'): Promise<OcrResult> {
  if (engine === 'ai') {
    const { mime, bytes } = decodeDataUrl(image);
    const text = await ocrWithCopilot(bytes, mime);
    return { text: text.trim() || '(no text found)', engine: 'copilot-studio' };
  }
  await ensureOffscreen();
  const res = (await chrome.runtime.sendMessage({ type: 'ORBIT_OFFSCREEN_OCR', image })) as
    | { ok: true; text: string; confidence: number }
    | { ok: false; error: string }
    | undefined;
  if (!res) throw new Error('The OCR engine did not answer. Reload the extension and try again.');
  if (!res.ok) throw new Error(`OCR failed: ${res.error}`);
  return { text: res.text, engine: 'tesseract', confidence: res.confidence };
}

chrome.runtime.onMessage.addListener((msg: ExtMessage, sender, sendResponse) => {
  if (msg.type === 'ORBIT_OFFSCREEN_OCR') return false; // answered by the offscreen document, not here
  handle(msg, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies BgResponse<unknown>))
    .catch((err: unknown) =>
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies BgResponse<unknown>),
    );
  return true; // keep the channel open for the async response
});
