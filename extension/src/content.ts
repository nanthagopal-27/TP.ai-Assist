/**
 * Content script entry (bundled as one classic script by vite.content.config.ts).
 *  - captures highlighted text and shows a small quick-launch button next to it
 *  - reads the page on request
 *  - places / runs in-page widgets (input box, output box, link buttons)
 *  - replaces selected text on the page (translate in place) with undo
 */
import type { ExtMessage } from './shared/types';
import { collectPage } from './content/page';
import { replaceSelection, undoReplace } from './content/replace';
import { initToolbar } from './content/builder';
import { initSelection } from './content/selection';
import {
  armNativeDrag, beginPlacement, cancelPlacement, disarmNativeDrag, initNativeDragAcceptor, initWidgets, listWidgets,
  moveWidget, removeWidget, updateWidget,
} from './content/widgets';

const w = window as unknown as { __orbitInjected?: boolean };

if (!w.__orbitInjected) {
  w.__orbitInjected = true;
  initSelection();
  initNativeDragAcceptor();
  void initWidgets().then(initToolbar);

  chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
    switch (msg.type) {
      case 'ORBIT_COLLECT_PAGE':
        sendResponse(collectPage());
        break;
      case 'ORBIT_WIDGET_PLACE': {
        const r = beginPlacement(msg.request);
        if (!r.ok) sendResponse({ __error: r.message });
        else sendResponse({ started: true });
        break;
      }
      case 'ORBIT_WIDGET_CANCEL':
        cancelPlacement();
        sendResponse({ cancelled: true });
        break;
      case 'ORBIT_WIDGET_LIST':
        sendResponse(listWidgets());
        break;
      case 'ORBIT_WIDGET_REMOVE':
        removeWidget(msg.id);
        sendResponse({ removed: true });
        break;
      case 'ORBIT_WIDGET_UPDATE': {
        const r = updateWidget(msg.id, msg.patch);
        sendResponse(r.ok ? { updated: true } : { __error: r.message });
        break;
      }
      case 'ORBIT_WIDGET_MOVE': {
        const r = moveWidget(msg.id);
        sendResponse(r.ok ? { started: true } : { __error: r.message });
        break;
      }
      case 'ORBIT_WIDGET_DRAG_ARM':
        armNativeDrag(msg.kind);
        sendResponse({ armed: true });
        break;
      case 'ORBIT_WIDGET_DRAG_DISARM':
        disarmNativeDrag();
        sendResponse({ disarmed: true });
        break;
      case 'ORBIT_REPLACE_SELECTION':
        sendResponse(replaceSelection(msg.text));
        break;
      case 'ORBIT_UNDO_REPLACE':
        sendResponse(undoReplace());
        break;
      default:
        return false;
    }
    return false;
  });
}
