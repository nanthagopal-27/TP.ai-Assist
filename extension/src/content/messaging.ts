import type { BgResponse, ExtMessage } from '../shared/types';
import { SHORT_NAME } from '../shared/config';

export const extAlive = (): boolean => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

/** Fire-and-forget. Never throws (the extension may have been reloaded under us). */
export function safeSend(msg: ExtMessage): void {
  try {
    chrome.runtime.sendMessage(msg).catch(() => undefined);
  } catch {
    /* orphaned content script */
  }
}

/** Ask the service worker for something and unwrap its { ok, data | error } envelope. */
export async function rpc<T>(msg: ExtMessage): Promise<T> {
  let res: BgResponse<T> | undefined;
  try {
    res = (await chrome.runtime.sendMessage(msg)) as BgResponse<T> | undefined;
  } catch {
    throw new Error(`${SHORT_NAME} was updated or reloaded. Refresh this page and try again.`);
  }
  if (!res) throw new Error(`No response from the ${SHORT_NAME} service worker.`);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
