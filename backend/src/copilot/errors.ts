/** A Direct Line / Copilot Studio failure, already mapped to a stable error code.
 * Never carries a token or secret in its message. */
export class CopilotError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "CopilotError";
    this.code = code;
    this.status = status;
  }

  toHttpBody(): { errorCode: string; message: string } {
    return { errorCode: this.code, message: this.message };
  }
}

export function fromHttpStatus(statusCode: number, context: string): CopilotError {
  if (statusCode === 401) return new CopilotError("COPILOT_UNAUTHORIZED", `Direct Line rejected the token (${context}).`, 502);
  if (statusCode === 403) return new CopilotError("COPILOT_FORBIDDEN", `Direct Line access forbidden (${context}).`, 502);
  if (statusCode === 404) return new CopilotError("COPILOT_CONVERSATION_NOT_FOUND", `Conversation not found or expired (${context}).`, 502);
  if (statusCode === 429) return new CopilotError("COPILOT_RATE_LIMIT", "Copilot Studio rate limit reached. Wait a few seconds and retry.", 429);
  if (statusCode === 400) return new CopilotError("COPILOT_BAD_REQUEST", `Direct Line rejected the request (${context}).`, 502);
  return new CopilotError("COPILOT_REQUEST_FAILED", `Direct Line request failed with HTTP ${statusCode} (${context}).`, 502);
}
