/** One reusable Copilot Studio session (conversationId + conversation-scoped token).
 * Token 1 (from fetchDirectLineToken) is used ONLY to start the conversation; every
 * subsequent call uses Token 2, returned by startConversation - never confuse the two. */
import * as client from "./client";
import { CopilotError } from "./errors";

const EXPIRY_BUFFER_SECONDS = 60;

export interface CopilotSession {
  conversationId: string;
  token: string;
  expiresAt: number; // ms epoch
}

let session: CopilotSession | null = null;
let inflight: Promise<CopilotSession> | null = null;

async function createSession(): Promise<CopilotSession> {
  const token1 = await client.fetchDirectLineToken();
  const conv = await client.startConversation(token1);
  return {
    conversationId: conv.conversationId,
    token: conv.token,
    expiresAt: Date.now() + ((conv.expires_in ?? 1800) - EXPIRY_BUFFER_SECONDS) * 1000,
  };
}

/** Reuse one active session across translation/OCR calls; create a fresh one only when
 * there isn't one yet, it's about to expire, or the caller explicitly asks for a new one
 * (after a 401/404 from Direct Line). A single in-flight promise keeps concurrent callers from
 * racing to create duplicate sessions. */
export async function getSession(forceNew = false): Promise<CopilotSession> {
  if (!forceNew && session && Date.now() < session.expiresAt) return session;
  if (!inflight) {
    inflight = createSession()
      .then((s) => {
        session = s;
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Run `fn(session)`, transparently refreshing the session and retrying once if Direct Line
 * says the conversation/token is no longer valid.
 *
 * Only ever wrap the send/upload step with this - NOT the wait-for-reply step. A 401/404 on
 * the send/upload call itself means that call was rejected outright (nothing was accepted by
 * Direct Line), so a fresh session + retry is provably safe. If the session instead dies
 * *after* a message/image was already accepted (e.g. mid-poll), that activity now belongs to a
 * conversation that's gone - retrying by resending would duplicate it, so callers must NOT
 * retry the wait step through this helper. */
export async function withSessionRetry<T>(
  fn: (session: CopilotSession) => Promise<T>,
): Promise<{ session: CopilotSession; result: T }> {
  let s = await getSession();
  try {
    return { session: s, result: await fn(s) };
  } catch (exc) {
    if (exc instanceof CopilotError && (exc.code === "COPILOT_UNAUTHORIZED" || exc.code === "COPILOT_CONVERSATION_NOT_FOUND")) {
      console.log(`[Copilot] Session invalid (${exc.code}) before send/upload - starting a new conversation and retrying once`);
      s = await getSession(true);
      return { session: s, result: await fn(s) };
    }
    throw exc;
  }
}
