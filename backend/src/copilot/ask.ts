import * as client from "./client";
import { parseCopilotResponse } from "./responseParser";
import { withSessionRetry } from "./session";

const FROM_ID = "extension-user";

/** Send any plain-text prompt to the agent and return its (cleaned) reply text.
 * Generic building block shared by translate.ts and main's general-purpose action path -
 * nothing here is specific to translation, OCR, or any particular action. */
export async function askCopilot(prompt: string): Promise<string> {
  // Safe to retry: a 401/404 here means the message was never accepted by Direct Line.
  const { session, result: sentMessageId } = await withSessionRetry((s) =>
    client.sendMessage(s.conversationId, s.token, prompt, FROM_ID),
  );
  // NOT retried: the message is already accepted, so a session failure here must not resend it.
  const activity = await client.waitForReply(session.conversationId, session.token, sentMessageId);
  return parseCopilotResponse(activity);
}
