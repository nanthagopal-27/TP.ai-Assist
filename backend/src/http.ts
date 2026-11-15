/** Mirrors FastAPI's HTTPException: a status code plus a detail payload (string or an object,
 * e.g. a Copilot error's {errorCode, message}) that route handlers can throw and a single
 * Express error-handling middleware turns into the right JSON response. */
export class HttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.name = "HttpError";
    this.status = status;
    this.detail = detail;
  }
}
