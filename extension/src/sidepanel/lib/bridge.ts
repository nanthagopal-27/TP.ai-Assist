import type { BgResponse, ExtMessage } from '../../shared/types';

/** Send a message to the service worker and unwrap its { ok, data | error } envelope. */
export function send<T = unknown>(msg: ExtMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res: BgResponse<T> | undefined) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res) return reject(new Error('No response from the extension service worker.'));
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}

export const api = <T,>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown) =>
  send<T>({ type: 'ORBIT_API_CALL', path, method, body });
