import * as client from "./client";
import * as config from "./config";
import { CopilotError } from "./errors";
import { parseCopilotResponse } from "./responseParser";
import { withSessionRetry } from "./session";

const FROM_ID = "extension-user";

function filenameFor(mimeType: string): string {
  return mimeType === "image/png" ? "image.png" : "image.jpg";
}

/** Uploads the image via Direct Line's raw-binary /upload endpoint and returns the text the
 * Copilot Studio agent's OCR-capable tool extracted. Direct Line itself does no OCR - if the
 * agent has no such capability configured, we say so clearly instead of faking a result or
 * quietly falling back to another AI provider. */
export async function ocrWithCopilot(imageBytes: Buffer, mimeType: string): Promise<string> {
  if (!config.OCR_CAPABILITY_CONFIGURED) {
    throw new CopilotError("COPILOT_OCR_UNAVAILABLE", "Copilot Studio OCR capability is not configured for this agent.", 503);
  }

  // Safe to retry: a 401/404 here means the image was never accepted by Direct Line.
  const { session, result: uploadedActivityId } = await withSessionRetry((s) => {
    console.log("[Copilot] Uploading image for OCR");
    return client.uploadImage(s.conversationId, s.token, imageBytes, mimeType, filenameFor(mimeType), FROM_ID);
  });

  // NOT retried: the image is already accepted, so a session failure here must not re-upload it.
  const activity = await client.waitForReply(session.conversationId, session.token, uploadedActivityId);
  const result = parseCopilotResponse(activity);
  console.log("[Copilot] Response received");
  return result;
}
