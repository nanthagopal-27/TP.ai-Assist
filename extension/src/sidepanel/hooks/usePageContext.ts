import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveTabContext, ExtMessage } from '../../shared/types';
import { send } from '../lib/bridge';

export interface PageState {
  loading: boolean;
  error: string | null;
  tab: ActiveTabContext | null;
  selection: string;
}

/** Keeps the side panel in sync with the active tab, its readable content and the live text selection. */
export function usePageContext() {
  const [state, setState] = useState<PageState>({ loading: true, error: null, tab: null, selection: '' });
  const tabIdRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const tab = await send<ActiveTabContext>({ type: 'ORBIT_GET_CONTEXT' });
      tabIdRef.current = tab.tabId;
      setState({ loading: false, error: null, tab, selection: tab.context?.selection ?? '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let timer: number | undefined;
    const listener = (msg: ExtMessage) => {
      if (msg.type === 'ORBIT_SELECTION_UPDATE' && msg.tabId === tabIdRef.current) {
        setState((s) => ({ ...s, selection: msg.text }));
      } else if (msg.type === 'ORBIT_TAB_CHANGED') {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void refresh(), 300); // debounce rapid tab events
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      window.clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [refresh]);

  return { ...state, refresh };
}
