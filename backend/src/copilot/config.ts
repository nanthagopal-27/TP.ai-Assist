/** Environment-based configuration for the Copilot Studio / Direct Line integration.
 * Two ways to get Token 1 - set ONE of these in backend-node/.env, never in the extension:
 *   COPILOT_TOKEN_ENDPOINT - the Copilot Studio-specific GET token endpoint (no secret needed).
 *   DIRECT_LINE_SECRET     - a Direct Line channel secret; the backend exchanges it for a token
 *                            itself via POST /v3/directline/tokens/generate. Either way, only a
 *                            short-lived bearer token is ever used after this - the secret/endpoint
 *                            itself stays in this backend process and is never sent to the browser. */
import "dotenv/config";

export const TOKEN_ENDPOINT = (process.env.COPILOT_TOKEN_ENDPOINT ?? "").trim();
export const DIRECT_LINE_SECRET = (process.env.DIRECT_LINE_SECRET ?? "").trim();
export const DIRECT_LINE_BASE_URL = (process.env.DIRECT_LINE_BASE_URL ?? "https://india.directline.botframework.com")
  .trim()
  .replace(/\/+$/, "");
export const RESPONSE_TIMEOUT_MS = parseInt(process.env.COPILOT_RESPONSE_TIMEOUT_MS ?? "30000", 10);
export const POLL_INTERVAL_MS = parseInt(process.env.COPILOT_POLL_INTERVAL_MS ?? "500", 10);

// Flip to "false" in .env if the Copilot Studio agent has no OCR-capable tool configured -
// the backend then returns a clear error instead of silently sending images it can't act on.
export const OCR_CAPABILITY_CONFIGURED = !["0", "false", "no"].includes(
  (process.env.COPILOT_OCR_CAPABILITY_CONFIGURED ?? "true").trim().toLowerCase(),
);

/** Whether enough is set in .env to actually talk to Direct Line (either auth option). */
export function isConfigured(): boolean {
  return !!(TOKEN_ENDPOINT || DIRECT_LINE_SECRET);
}
