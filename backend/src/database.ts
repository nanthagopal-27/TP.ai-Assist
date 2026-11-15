/** SQLite storage for Orbit PixieBrix (request logging / history).
 * Uses Node's built-in node:sqlite (no native module / C++ build toolchain required) - the
 * database file is created automatically at backend-node/data/orbit.db on first start. */
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "orbit.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS request_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    TEXT NOT NULL,
    created_at    REAL NOT NULL,
    action        TEXT NOT NULL,
    page_url      TEXT,
    page_title    TEXT,
    input_chars   INTEGER NOT NULL DEFAULT 0,
    input_preview TEXT,
    prompt        TEXT,
    output_json   TEXT,
    status        TEXT NOT NULL,          -- 'ok' | 'error'
    error         TEXT,
    model         TEXT,
    latency_ms    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS form_submissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  REAL NOT NULL,
    form_title  TEXT,
    widget_id   TEXT,
    page_url    TEXT,
    page_title  TEXT,
    data_json   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created ON form_submissions(created_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  REAL NOT NULL,
    to_addr     TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL,          -- 'sent' | 'mock' | 'error'
    error       TEXT,
    widget_id   TEXT,
    page_url    TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox(created_at DESC);
`;

let db: DatabaseSync | null = null;

export function initDb(): void {
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
}

function conn(): DatabaseSync {
  if (!db) throw new Error("Database not initialized - call initDb() first.");
  return db;
}

export interface LogRequestInput {
  requestId: string;
  action: string;
  pageUrl: string | null;
  pageTitle: string | null;
  inputChars: number;
  inputPreview: string | null;
  prompt: string | null | undefined;
  outputJson: string | null;
  status: "ok" | "error";
  error: string | null;
  model: string | null;
  latencyMs: number | null;
}

export function logRequest(input: LogRequestInput): void {
  conn()
    .prepare(
      `INSERT INTO request_logs
        (request_id, created_at, action, page_url, page_title, input_chars,
         input_preview, prompt, output_json, status, error, model, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.requestId,
      Date.now() / 1000,
      input.action,
      input.pageUrl,
      input.pageTitle,
      input.inputChars,
      (input.inputPreview ?? "").slice(0, 500),
      input.prompt ?? null,
      input.outputJson,
      input.status,
      input.error,
      input.model,
      input.latencyMs,
    );
}

export function recentRequests(limit = 25): unknown[] {
  return conn()
    .prepare(
      `SELECT request_id, created_at, action, page_url, page_title, input_chars,
              input_preview, prompt, status, error, model, latency_ms
       FROM request_logs ORDER BY id DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 200)));
}

export function clearRequests(): number {
  return Number(conn().prepare("DELETE FROM request_logs").run().changes);
}

// ----------------------------------------------------------------------------- form submissions
export interface AddSubmissionInput {
  formTitle: string;
  widgetId: string;
  pageUrl: string;
  pageTitle: string;
  data: Record<string, string>;
}

export function addSubmission(input: AddSubmissionInput): { id: number; createdAt: number } {
  const now = Date.now() / 1000;
  const result = conn()
    .prepare(
      `INSERT INTO form_submissions (created_at, form_title, widget_id, page_url, page_title, data_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(now, input.formTitle, input.widgetId, input.pageUrl, input.pageTitle, JSON.stringify(input.data));
  return { id: Number(result.lastInsertRowid), createdAt: now };
}

export function recentSubmissions(limit = 50): unknown[] {
  const rows = conn()
    .prepare(
      `SELECT id, created_at, form_title, widget_id, page_url, page_title, data_json
       FROM form_submissions ORDER BY id DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 500))) as Record<string, unknown>[];
  return rows.map(({ data_json, ...rest }) => ({ ...rest, data: JSON.parse(data_json as string) }));
}

export function clearSubmissions(): number {
  return Number(conn().prepare("DELETE FROM form_submissions").run().changes);
}

// ----------------------------------------------------------------------------- e-mail outbox
export interface AddEmailInput {
  toAddr: string;
  subject: string;
  body: string;
  status: "sent" | "mock" | "error";
  error?: string | null;
  widgetId?: string;
  pageUrl?: string;
}

export function addEmail(input: AddEmailInput): { id: number; createdAt: number } {
  const now = Date.now() / 1000;
  const result = conn()
    .prepare(
      `INSERT INTO email_outbox (created_at, to_addr, subject, body, status, error, widget_id, page_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(now, input.toAddr, input.subject, input.body, input.status, input.error ?? null, input.widgetId ?? "", input.pageUrl ?? "");
  return { id: Number(result.lastInsertRowid), createdAt: now };
}

export function recentEmails(limit = 50): unknown[] {
  return conn()
    .prepare(
      `SELECT id, created_at, to_addr, subject, body, status, error, widget_id, page_url
       FROM email_outbox ORDER BY id DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 500)));
}

export function clearEmails(): number {
  return Number(conn().prepare("DELETE FROM email_outbox").run().changes);
}
