/** TP.ai Assist - Node.js/TypeScript backend (1:1 port of the former FastAPI backend).
 *
 * Exposes a single AI endpoint (POST /api/ai) that contains an "AI Action Router": the
 * extension sends {action, prompt, selected_text, page, ...}; the router picks the action spec
 * (summarize / translate / explain / extract / extract_ids / person / company / ask), builds the
 * prompt and sends it to a Copilot Studio agent over the Bot Framework Direct Line REST API (see
 * src/copilot/), then returns a structured JSON response.
 *
 * Run: npm run dev   (or: npm start)
 * No HTTPS / certificate needed - the extension talks to http://localhost:8000. */
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";

import * as config from "./config";
import { HttpError } from "./http";
import * as database from "./database";
import * as emailer from "./emailer";
import * as weatherService from "./weather";
import { isConfigured as copilotConfigured } from "./copilot/config";
import { ocrWithCopilot } from "./copilot/ocr";
import { CopilotError } from "./copilot/errors";
import { ACTIONS, routeAction, type AIRequest, type ActionId, type Scope } from "./actions";

const ACTION_IDS = new Set<ActionId>(["summarize", "translate", "explain", "extract", "extract_ids", "person", "company", "ask"]);
const SCOPES = new Set<Scope>(["auto", "selection", "page"]);

database.initDb();
console.log(
  `${config.PRODUCT_NAME} backend ready - model=copilot-studio (${
    config.MOCK_MODE ? "MOCK" : copilotConfigured() ? "configured" : "NOT CONFIGURED"
  })`,
);

const app = express();
app.use(express.json({ limit: "15mb" }));

// CORS: allow the Chrome extension origin plus localhost tooling. Requests from the extension's
// service worker are already exempt through host_permissions, but this keeps direct calls (side
// panel, curl, browser) working too.
const ORIGIN_RE = /^(chrome-extension:\/\/[a-z]{32}|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ORIGIN_RE.test(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: false,
  }),
);

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

// --------------------------------------------------------------------------- #
// AI
// --------------------------------------------------------------------------- #
function parseAIRequest(body: Record<string, unknown>): AIRequest {
  const action = body.action as ActionId;
  if (!ACTION_IDS.has(action)) throw new HttpError(422, `Invalid action '${String(action)}'`);
  const scope = (body.scope as Scope) ?? "auto";
  if (!SCOPES.has(scope)) throw new HttpError(422, `Invalid scope '${String(scope)}'`);
  const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : undefined;
  const selectedText = typeof body.selected_text === "string" ? body.selected_text.slice(0, 100_000) : undefined;
  const targetLanguage = typeof body.target_language === "string" ? body.target_language.slice(0, 60) : undefined;
  const pageIn = body.page as Record<string, unknown> | undefined;
  const page = pageIn
    ? {
        url: String(pageIn.url ?? ""),
        title: String(pageIn.title ?? ""),
        description: String(pageIn.description ?? ""),
        text: String(pageIn.text ?? ""),
      }
    : undefined;
  return { action, prompt, scope, selected_text: selectedText, page, target_language: targetLanguage };
}

app.post(
  "/api/ai",
  asyncHandler(async (req, res) => {
    const aiReq = parseAIRequest(req.body);
    const response = await routeAction(aiReq);
    res.json(response);
  }),
);

app.get("/api/actions", (_req, res) => {
  res.json(Object.values(ACTIONS).map((a) => ({ id: a.id, label: a.label, needs_prompt: !!a.needsPrompt, uses_language: !!a.usesLanguage })));
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    model: config.MOCK_MODE ? "mock" : "copilot-studio",
    mock: config.MOCK_MODE,
    api_key_configured: copilotConfigured(),
    smtp_configured: emailer.configured(),
  });
});

// --------------------------------------------------------------------------- #
// Weather
// --------------------------------------------------------------------------- #
app.get(
  "/api/weather",
  asyncHandler(async (req, res) => {
    const location = String(req.query.location ?? "").trim();
    if (location.length < 2 || location.length > 80) throw new HttpError(422, "location must be 2-80 characters");
    const units = req.query.units === "f" ? "f" : "c";
    const data = config.MOCK_MODE ? weatherService.mockWeather(location, units) : await weatherService.getWeather(location, units);
    res.json(data);
  }),
);

// --------------------------------------------------------------------------- #
// Form submissions
// --------------------------------------------------------------------------- #
function parseSubmission(body: Record<string, unknown>): database.AddSubmissionInput {
  const dataIn = body.data as Record<string, string> | undefined;
  if (!dataIn || typeof dataIn !== "object" || Array.isArray(dataIn)) throw new HttpError(422, "data must contain 1-60 fields");
  const entries = Object.entries(dataIn);
  if (entries.length === 0 || entries.length > 60) throw new HttpError(422, "data must contain 1-60 fields");
  const data: Record<string, string> = {};
  for (const [k, v] of entries) data[String(k).slice(0, 100)] = String(v).slice(0, 10_000);
  return {
    formTitle: String(body.form_title ?? "").slice(0, 200),
    widgetId: String(body.widget_id ?? "").slice(0, 80),
    pageUrl: String(body.page_url ?? "").slice(0, 2000),
    pageTitle: String(body.page_title ?? "").slice(0, 500),
    data,
  };
}

app.post(
  "/api/submissions",
  asyncHandler(async (req, res) => {
    const { id, createdAt } = database.addSubmission(parseSubmission(req.body));
    res.json({ id, created_at: createdAt });
  }),
);

app.get("/api/submissions", (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500));
  res.json(database.recentSubmissions(limit));
});

app.delete("/api/submissions", (_req, res) => {
  res.json({ deleted: database.clearSubmissions() });
});

// --------------------------------------------------------------------------- #
// E-mail (Escalate button)
// --------------------------------------------------------------------------- #
const EMAIL_RE = /^[A-Za-z0-9._%+\-']+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const sentLog: Array<[number, string]> = [];

function checkEmailRate(to: string): void {
  const now = Date.now() / 1000;
  while (sentLog.length && now - sentLog[0][0] > 3600) sentLog.shift();
  if (sentLog.length >= config.MAX_EMAILS_PER_HOUR) {
    throw new HttpError(429, `E-mail limit reached (${config.MAX_EMAILS_PER_HOUR} per hour). Try again later.`);
  }
  const toLower = to.toLowerCase();
  const perRecipient = sentLog.filter(([, t]) => t === toLower).length;
  if (perRecipient >= config.MAX_EMAILS_PER_RECIPIENT_HOUR) {
    throw new HttpError(429, `Too many e-mails to ${to} in the last hour (${config.MAX_EMAILS_PER_RECIPIENT_HOUR} max).`);
  }
}

interface EmailIn {
  to: string;
  subject: string;
  body: string;
  widget_id: string;
  page_url: string;
}

function parseEmailIn(body: Record<string, unknown>): EmailIn {
  const to = String(body.to ?? "")
    .trim()
    .slice(0, 254);
  if (!EMAIL_RE.test(to)) throw new HttpError(422, "Enter a valid e-mail address.");
  const subject = String(body.subject ?? "").split(/\s+/).filter(Boolean).join(" ").slice(0, 200);
  if (!subject) throw new HttpError(422, "subject is required.");
  const emailBody = String(body.body ?? "").slice(0, 20_000);
  if (!emailBody) throw new HttpError(422, "body is required.");
  return {
    to,
    subject,
    body: emailBody,
    widget_id: String(body.widget_id ?? "").slice(0, 80),
    page_url: String(body.page_url ?? "").slice(0, 2000),
  };
}

app.post(
  "/api/send-email",
  asyncHandler(async (req, res) => {
    const emailReq = parseEmailIn(req.body);
    checkEmailRate(emailReq.to);
    const common = { toAddr: emailReq.to, subject: emailReq.subject, body: emailReq.body, widgetId: emailReq.widget_id, pageUrl: emailReq.page_url };
    if (config.MOCK_MODE && !emailer.configured()) {
      const { id } = database.addEmail({ ...common, status: "mock" });
      res.json({ ok: true, mode: "mock", id, message: `Demo mode: e-mail to ${emailReq.to} was NOT really sent (SMTP not configured).` });
      return;
    }
    if (!emailer.configured()) {
      throw new HttpError(503, "E-mail is not configured. Add SMTP_HOST / SMTP_USER / SMTP_PASSWORD to backend/.env (or set MOCK_MODE=true to test without sending).");
    }
    try {
      await emailer.send(emailReq.to, emailReq.subject, emailReq.body);
    } catch (exc) {
      database.addEmail({ ...common, status: "error", error: (exc as Error).message });
      throw new HttpError(502, (exc as Error).message);
    }
    sentLog.push([Date.now() / 1000, emailReq.to.toLowerCase()]);
    const { id } = database.addEmail({ ...common, status: "sent" });
    res.json({ ok: true, mode: "smtp", id, message: `E-mail sent to ${emailReq.to}.` });
  }),
);

app.get("/api/emails", (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500));
  res.json(database.recentEmails(limit));
});

app.delete("/api/emails", (_req, res) => {
  res.json({ deleted: database.clearEmails() });
});

// --------------------------------------------------------------------------- #
// OCR via Copilot Studio / Direct Line (optional "AI" engine of the OCR widget; the default
// engine runs offline in the browser). Direct Line is only the transport - the Copilot Studio
// agent must have an OCR-capable tool configured; see src/copilot/ocr.ts.
// --------------------------------------------------------------------------- #
const OCR_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/;

app.post(
  "/api/ocr",
  asyncHandler(async (req, res) => {
    const image = String(req.body?.image ?? "");
    if (image.length > 12_000_000) throw new HttpError(422, "Image payload is too large.");
    const match = OCR_DATA_URL_RE.exec(image);
    if (!match) throw new HttpError(422, "Send a PNG / JPEG / WebP image as a base64 data URL.");
    const [, mime, b64] = match;
    let raw: Buffer;
    try {
      raw = Buffer.from(b64, "base64");
    } catch {
      throw new HttpError(422, "The image is not valid base64.");
    }
    if (raw.length > 8_000_000) throw new HttpError(413, "Image is too large (max 8 MB).");
    if (config.MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 400));
      res.json({
        text: "MOCK OCR - no Copilot call was made.\nSet MOCK_MODE=false and COPILOT_TOKEN_ENDPOINT to read real text.",
        engine: "mock",
        mock: true,
      });
      return;
    }
    try {
      const text = await ocrWithCopilot(raw, mime);
      res.json({ text: text.trim() || "(no text found)", engine: "copilot-studio", mock: false });
    } catch (exc) {
      if (exc instanceof CopilotError) {
        console.warn(`Copilot OCR failed: ${exc.message}`);
        throw new HttpError(exc.status, exc.toHttpBody());
      }
      throw exc;
    }
  }),
);

// --------------------------------------------------------------------------- #
// History
// --------------------------------------------------------------------------- #
app.get("/api/history", (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "25"), 10) || 25, 200));
  res.json(database.recentRequests(limit));
});

app.delete("/api/history", (_req, res) => {
  res.json({ deleted: database.clearRequests() });
});

// --------------------------------------------------------------------------- #
// Error handling (mirrors FastAPI's HTTPException -> {detail: ...} JSON response)
// --------------------------------------------------------------------------- #
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.detail });
    return;
  }
  console.error(err);
  res.status(500).json({ detail: "Internal server error." });
});

app.listen(config.PORT, config.HOST, () => {
  console.log(`${config.PRODUCT_NAME} backend listening on http://${config.HOST}:${config.PORT}`);
});
