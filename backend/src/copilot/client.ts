/** Thin wrapper over the Bot Framework Direct Line v3 REST API.
 * Nothing OCR/translation-specific lives here - just token, conversation, activities and upload. */
import * as config from "./config";
import { CopilotError, fromHttpStatus } from "./errors";

const HTTP_TIMEOUT_MS = 20_000;

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (exc) {
    // `fetch`'s own error message is almost always the generic "fetch failed" - the actually
    // useful detail (DNS failure, TLS handshake error, ECONNRESET, ...) is on `.cause`. Surface
    // it so a real network/TLS problem doesn't just look like an opaque, undiagnosable failure.
    const err = exc as Error & { cause?: unknown };
    const cause = err.cause instanceof Error ? ` (${err.cause.message})` : err.cause ? ` (${String(err.cause)})` : "";
    console.error("[Copilot] fetch failed:", err.message, err.cause ?? "");
    throw new CopilotError("COPILOT_NETWORK_ERROR", `Could not reach Direct Line: ${err.message}${cause}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Step 1: get a fresh bearer token. Two ways, in priority order - whichever is configured:
 * 1) COPILOT_TOKEN_ENDPOINT - GET the Copilot Studio-specific token endpoint (no secret sent).
 * 2) DIRECT_LINE_SECRET - the backend itself exchanges this secret for a token via the
 *    standard Direct Line endpoint. The secret is read from the environment and never leaves
 *    this process; only the resulting short-lived token is used afterwards. */
export async function fetchDirectLineToken(): Promise<string> {
  if (config.TOKEN_ENDPOINT) return fetchTokenFromEndpoint();
  if (config.DIRECT_LINE_SECRET) return fetchTokenFromSecret();
  throw new CopilotError("COPILOT_NOT_CONFIGURED", "Set COPILOT_TOKEN_ENDPOINT or DIRECT_LINE_SECRET in backend/.env.", 503);
}

async function fetchTokenFromEndpoint(): Promise<string> {
  console.log("[Copilot] Requesting a fresh Direct Line token (via COPILOT_TOKEN_ENDPOINT)");
  const resp = await timedFetch(config.TOKEN_ENDPOINT, { headers: { "Content-Type": "application/json" } });
  if (resp.status !== 200) throw fromHttpStatus(resp.status, "token endpoint");
  const data = (await resp.json().catch(() => null)) as { token?: string } | null;
  if (!data?.token) throw new CopilotError("COPILOT_REQUEST_FAILED", "Token endpoint responded without a token.", 502);
  return data.token;
}

async function fetchTokenFromSecret(): Promise<string> {
  const url = `${config.DIRECT_LINE_BASE_URL}/v3/directline/tokens/generate`;
  console.log("[Copilot] Requesting a fresh Direct Line token (via DIRECT_LINE_SECRET)");
  const resp = await timedFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.DIRECT_LINE_SECRET}`, "Content-Type": "application/json" },
  });
  if (resp.status !== 200) throw fromHttpStatus(resp.status, "tokens/generate");
  const data = (await resp.json().catch(() => null)) as { token?: string } | null;
  if (!data?.token) throw new CopilotError("COPILOT_REQUEST_FAILED", "tokens/generate responded without a token.", 502);
  return data.token;
}

export interface StartConversation {
  conversationId: string;
  token: string;
  expires_in?: number;
}

/** Step 2: POST /conversations using Token 1. Returns the conversation-scoped Token 2. */
export async function startConversation(token: string): Promise<StartConversation> {
  const url = `${config.DIRECT_LINE_BASE_URL}/v3/directline/conversations`;
  console.log("[Copilot] Starting a new Direct Line conversation");
  const resp = await timedFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (resp.status !== 200 && resp.status !== 201) throw fromHttpStatus(resp.status, "start conversation");
  const data = (await resp.json().catch(() => null)) as StartConversation | null;
  if (!data?.conversationId || !data?.token) {
    throw new CopilotError("COPILOT_REQUEST_FAILED", "Start-conversation response is missing conversationId/token.", 502);
  }
  console.log("[Copilot] Session created");
  return data;
}

/** Step 3: POST a text activity. Returns the outbound activity id (sentMessageId). */
export async function sendMessage(
  conversationId: string,
  conversationToken: string,
  text: string,
  fromId = "extension-user",
): Promise<string> {
  const url = `${config.DIRECT_LINE_BASE_URL}/v3/directline/conversations/${conversationId}/activities`;
  console.log("[Copilot] Sending message activity");
  const resp = await timedFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${conversationToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "message", from: { id: fromId }, text }),
  });
  if (resp.status !== 200 && resp.status !== 201) throw fromHttpStatus(resp.status, "send message");
  const data = (await resp.json().catch(() => null)) as { id?: string } | null;
  if (!data?.id) throw new CopilotError("COPILOT_REQUEST_FAILED", "Send-message response did not include an activity id.", 502);
  console.log("[Copilot] Activity ID received");
  return data.id;
}

/** Raw binary upload (NOT multipart/form-data, NOT JSON) - the image bytes are the body. */
export async function uploadImage(
  conversationId: string,
  conversationToken: string,
  imageBytes: Buffer,
  mimeType: string,
  filename: string,
  userId = "extension-user",
): Promise<string> {
  const url = `${config.DIRECT_LINE_BASE_URL}/v3/directline/conversations/${conversationId}/upload?userId=${encodeURIComponent(userId)}`;
  console.log(`[Copilot] Uploading image (${imageBytes.length} bytes, ${mimeType})`);
  const resp = await timedFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conversationToken}`,
      "Content-Type": mimeType,
      "Content-Disposition": `name="file"; filename="${filename}"`,
    },
    body: imageBytes,
  });
  if (resp.status !== 200 && resp.status !== 201) throw fromHttpStatus(resp.status, "upload image");
  const data = (await resp.json().catch(() => null)) as { id?: string } | null;
  if (!data?.id) throw new CopilotError("COPILOT_REQUEST_FAILED", "Upload response did not include an activity id.", 502);
  console.log("[Copilot] Activity ID received");
  return data.id;
}

export interface DirectLineActivity {
  id?: string;
  replyToId?: string;
  text?: string;
  value?: unknown;
  [key: string]: unknown;
}

interface ActivitiesResponse {
  watermark?: string;
  activities?: DirectLineActivity[];
}

/** Step 4: GET activities, optionally since a watermark. */
export async function getActivities(
  conversationId: string,
  conversationToken: string,
  watermark?: string | null,
): Promise<ActivitiesResponse> {
  const url = new URL(`${config.DIRECT_LINE_BASE_URL}/v3/directline/conversations/${conversationId}/activities`);
  if (watermark) url.searchParams.set("watermark", watermark);
  const resp = await timedFetch(url.toString(), { headers: { Authorization: `Bearer ${conversationToken}` } });
  if (resp.status !== 200) throw fromHttpStatus(resp.status, "get activities");
  return ((await resp.json().catch(() => null)) as ActivitiesResponse | null) ?? {};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll activities until one's replyToId matches sentMessageId (deterministic correlation -
 * never just takes the latest activity, per the required pattern). watermark is kept local to
 * this single poll loop so concurrent requests never share/advance each other's cursor. */
export async function waitForReply(
  conversationId: string,
  conversationToken: string,
  sentMessageId: string,
): Promise<DirectLineActivity> {
  console.log("[Copilot] Waiting for response");
  const deadline = Date.now() + config.RESPONSE_TIMEOUT_MS;
  let watermark: string | undefined;
  for (;;) {
    const data = await getActivities(conversationId, conversationToken, watermark);
    watermark = data.watermark ?? watermark;
    for (const activity of data.activities ?? []) {
      if (activity.replyToId === sentMessageId) {
        console.log("[Copilot] Matching replyToId found");
        return activity;
      }
    }
    if (Date.now() >= deadline) {
      throw new CopilotError("COPILOT_TIMEOUT", "Copilot Studio did not return a response within the configured timeout.", 504);
    }
    await sleep(config.POLL_INTERVAL_MS);
  }
}
