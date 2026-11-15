# Orbit PixieBrix (POC)

An internal, free-stack alternative to PixieBrix. A Chrome side panel + in-page widgets that sit on top of
third-party enterprise websites and give operations employees real-time AI help: summarize, translate,
explain, extract key details, person / company info and free-form Q&A - powered by **Gemini 2.5 Flash**.

* **Extension:** React + TypeScript + Vite + Material UI, Manifest V3 (white / grey theme, "Orbit" branding)
* **Backend:** Node.js + TypeScript + Express + SQLite (local, `http://localhost:8000`)
* **LLM:** Microsoft Copilot Studio agent via the Bot Framework Direct Line REST API
* **No SSL certificate, no admin rights, no Docker.** Everything is plain `http://localhost`. See [Why no certificate is needed](#why-no-certificate-is-needed).

---

## 1. Folder structure

```
orbit-webassist/
├── README.md
├── .gitignore
├── backend/                        # Node.js + TypeScript + Express + SQLite
│   ├── src/
│   │   ├── index.ts                # Express app: POST /api/ai, /api/weather, /api/submissions,
│   │   │                            #   /api/send-email, /api/emails, /api/ocr, /api/history
│   │   ├── actions.ts               # AI Action Router: the 8 action specs, prompt building, response parsing
│   │   ├── emailer.ts               # SMTP sender (Gmail / Office 365 / company relay) for the Escalate button
│   │   ├── weather.ts               # Weather (Open-Meteo, no key) + built-in Indian states table
│   │   ├── database.ts              # SQLite (node:sqlite, built into Node - no native build step): request
│   │   │                            #   log, form submissions, e-mail outbox
│   │   ├── config.ts, http.ts
│   │   └── copilot/                 # Bot Framework Direct Line integration (token/session/client/ask/
│   │                                #   translate/ocr/responseParser)
│   ├── package.json, tsconfig.json
│   └── .env.example                 # copy to .env and set COPILOT_TOKEN_ENDPOINT or DIRECT_LINE_SECRET
└── extension/                      # Chrome extension (React + Vite + MUI, MV3)
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts              # build 1: side panel + service worker
    ├── vite.content.config.ts      # build 2: content script as a single file
    ├── scripts/                    # clean.mjs, dev.mjs, copy-ocr.mjs (copies the offline OCR engine into dist/ocr)
    ├── offscreen.html              # hidden page that runs the OCR engine (Tesseract, WebAssembly)
    ├── sidepanel.html              # side panel entry HTML
    ├── public/
    │   ├── manifest.json           # Manifest V3 (copied to dist/)
    │   └── icons/                  # 16/32/48/128 px
    └── src/
        ├── background.ts           # Service worker: message routing, API calls, context menu
        ├── content.ts              # Content script entry (message handler)
        ├── content/                # In-page engine (built as one self-contained script)
        │   ├── selection.ts        # Highlight capture + floating "Orbit" button
        │   ├── picker.ts           # "Click anywhere on the page to place it" overlay
        │   ├── widgets.ts          # Widget engine: place / move / edit / remove, save + re-attach per page
        │   ├── builder.ts          # On-page toolbar (component chips) + properties card on the website
        │   ├── ui/                 # One file per component: fields.ts (text, textarea, dropdown, checkbox, radio),
        │   │                       #   form.ts, weather.ts, button.ts, ai.ts (AI input/output)
        │   ├── replace.ts          # Replace selected text on the page (translate in place) + undo
        │   └── page.ts, render.ts, styles.ts, dom.ts, messaging.ts
        ├── shared/
        │   ├── types.ts            # Message + payload types shared by all parts
        │   ├── config.ts           # Defaults (backend URL, languages, storage keys)
        │   ├── draft.ts            # Component list, defaults + validation (shared by side panel and on-page toolbar)
        │   ├── weather.ts          # Weather fetched by the service worker straight from Open-Meteo
        │   └── utils.ts            # URL validation for link buttons
        └── sidepanel/
            ├── main.tsx            # React entry (MUI ThemeProvider)
            ├── App.tsx             # Side panel shell, state, action runner
            ├── theme.ts            # White / grey MUI theme
            ├── hooks/usePageContext.ts
            ├── lib/bridge.ts       # Promise wrapper around chrome.runtime messaging
            ├── lib/workflows.tsx   # Action definitions + URL-matched workflows (dynamic buttons)
            ├── lib/components.tsx  # Widget palette (icons); logic lives in shared/draft.ts (used by the toolbar too)
            └── components/         # Header, Logo, ContextCard, ActionGrid, ResultCard, HistoryTab, SettingsDialog,
                                    #   WidgetsTab (palette + placement), PropertiesEditor, FormFieldsEditor
```

## 2. How it works

```
 ┌────────────────────┐  selection / page text   ┌──────────────────────┐   fetch (HTTP)   ┌────────────────────────┐
 │  content.ts        │ ───────────────────────▶ │  background.ts        │ ───────────────▶ │ FastAPI  :8000         │
 │  (any web page)    │ ◀─ ORBIT_COLLECT_PAGE ─── │  (service worker)     │ ◀─────────────── │  POST /api/ai          │
 │  • selection watch │                          │  • message router     │   JSON result    │  └ AI Action Router    │
 │  • floating button │                          │  • backend proxy      │                  │     summarize/translate│
 └────────────────────┘                          │  • context menu       │                  │     explain/extract/   │
                                                 └──────────▲────────────┘                  │     person/company/ask │
                                                            │ runtime messages              │  └ Gemini 2.5 Flash    │
                                                 ┌──────────┴────────────┐                  │  └ SQLite request log  │
                                                 │ Side panel (React+MUI)│                  └────────────────────────┘
                                                 │ dynamic action buttons│
                                                 └───────────────────────┘
```

1. `content.ts` watches your mouse/keyboard selection (also inside inputs/textareas) and shows a small **Orbit** button next to it. It also reads the page's visible text on request.
2. `background.ts` (service worker) routes every message and is the **only** component that calls the backend.
3. The side panel renders **action buttons chosen by a workflow** (matched on the page URL), e.g. CRM/ticketing sites put *Person* and *Company* first.
4. `POST /api/ai` receives `{action, prompt, scope, selected_text, page, target_language}`; the **AI Action Router** in `main.py` picks the action spec, builds a safe prompt, calls Gemini with a JSON schema, logs to SQLite and returns:

```json
{
  "request_id": "a1b2c3d4e5f6",
  "action": "summarize",
  "model": "gemini-2.5-flash",
  "latency_ms": 1840,
  "mock": false,
  "result": {
    "title": "Refund policy overview",
    "content": "Markdown answer…",
    "bullets": ["key point", "key point"],
    "fields": [{ "label": "Order ID", "value": "A-10293" }]
  }
}
```

## 3. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18+ (20/22 recommended) | `node -v` |
| Google Chrome (or Edge) | 116+ (Side Panel API) | `chrome://version` |
| Copilot Studio agent (Direct Line channel enabled) | - | see `backend/.env.example` |

## 4. Backend setup (Node.js + Express)

**Windows (PowerShell) / macOS / Linux - same commands everywhere**
```bash
cd orbit-webassist/backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
# edit .env: set COPILOT_TOKEN_ENDPOINT or DIRECT_LINE_SECRET (see the comments in the file)
npm run dev                   # auto-restarts on file changes
```

Verify: open http://localhost:8000/api/health → `{"status":"ok","model":"copilot-studio",...,"api_key_configured":true}`

> **No Copilot agent configured yet?** Set `MOCK_MODE=true` in `.env`. The whole extension works end-to-end with canned answers so you can test the UI and message flow first.

The SQLite file is created automatically at `backend/data/orbit.db` (via Node's built-in `node:sqlite` - no native module or C++ build toolchain needed).

For a production-style run: `npm run build && npm start` (compiles to `backend/dist` and runs plain `node`, no `tsx` needed at runtime).

## 5. Build the extension (Vite)

```bash
cd orbit-webassist/extension
npm install
npm run build        # outputs the loadable extension to extension/dist (two Vite passes)
```

For development use `npm run dev` (rebuilds `dist/` on every save; click the reload icon on `chrome://extensions` after a rebuild).

## 6. Load the unpacked extension in Chrome

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`extension/dist`** folder.
4. Pin the **Orbit PixieBrix** icon from the puzzle-piece menu.

## 7. Test the real-time workflow

1. Make sure the backend is running (section 4). The side panel header chip should say **Gemini 2.5 Flash** (or *Mock mode*) with a grey dot.
2. Open any normal website, e.g. a Wikipedia article or a news page. *(Pages that were already open before you installed the extension are handled automatically.)*
3. Click the **Orbit** toolbar icon → the side panel opens.
4. **Page context:** the *Current page* card shows the title and how many characters were read.
5. **Selection capture:** highlight a paragraph with your mouse. It appears instantly in the card, and a small **Orbit** button pops up next to the selection (click it to open the panel). Right-click → **Orbit: Assist with "…"** works too.
6. Click **Summarize Webpage**, **Explain Content**, **Translate Text** (pick the target language), **Extract Key Details**, **Person Information**, **Company Information**.
7. **Ask AI:** type a question in the bottom box and press Enter (e.g. *"What is the refund window?"*).
8. Use the **Auto / Selection / Full page** toggle to force which text is sent. *Auto* = selection if you have one, otherwise the page.
9. The **History** tab shows what was logged in SQLite. Use ⚙ **Settings → Test connection** if the chip says *Backend offline*.

You can also test the API directly:
```bash
curl -X POST http://localhost:8000/api/ai -H "Content-Type: application/json" -d '{"action":"translate","target_language":"French","selected_text":"Good morning, how can I help you?"}'
```

## 7b. In-page widgets (the PixieBrix-style part)

The widget builder is available in **two places that do the same thing**:

* **On the website itself** - a dark toolbar appears at the top of the page (like PixieBrix's Sidebar Widget Builder) with a chip per component. It appears when you open the **Widgets** tab, and you can hide it with its **×** or the *Show widget toolbar on websites* switch in the side panel.
* **In the side panel** - the **Widgets** tab has the same palette and the same properties form.

1. **Pick a component** (toolbar chip or palette tile).
2. **Fill in its details** in the properties card that opens.
3. Choose **Inline** (part of the page, scrolls with it) or **Float** (fixed on screen, drag by the header) and press **Place on page**.
4. **Click anywhere on the page** (a highlight such as `afterend · p` shows where it will go) or press **Esc** to cancel. Place as many as you like.
5. **Edit later:** hover a widget on the page and use **Move**, **Edit** or **×**. *Edit* opens the properties card right on the website; **Save changes** updates the widget live. The side panel's **On this page** list has Edit / Delete too.

| Component | Details you fill in |
|---|---|
| **Text Input** | Label, field name (auto-filled from the label), placeholder, default value, help text, required, validation: min length, max length, regex pattern |
| **Text Area** | Same as Text Input |
| **Dropdown** | Label, field name, **options (one per line - you add the data)**, default, required |
| **Checkbox** | Label, field name, default checked, required |
| **Radio Group** | Label, field name, options (one per line), default, required |
| **Form** | Title, any number of fields (text, textarea, dropdown, checkbox, radio - add / reorder / delete), submit button label, success message, optional "Continue" link. On **Submit** the values are validated and stored in SQLite (see **History → Form submissions**); the widget then shows a success summary with **Submit another** |
| **Link Button** | Label, any `http(s)` URL, *New tab* / *Same tab*. Clicking it navigates to the link. `javascript:` and similar are rejected |
| **Action Button** (e.g. *Escalate*) | Button label + style, **ask for the e-mail address on click** (or a fixed recipient), optional note from the sender, **subject and body templates** with placeholders `{{email}} {{note}} {{page_title}} {{page_url}} {{selection}} {{date}} {{time}}`, message after sending. Click → dialog asks for the e-mail address → shows a preview → **Send e-mail**. The backend sends it over SMTP (see 7c). The last address typed is remembered |
| **OCR** | Engine: *Offline* (built-in Tesseract, English, no internet) or *AI vision* (Gemini via the backend, any language). On the page: **Select area** → drag a box over any image / scanned text → the captured picture appears → **Extract text** → the text appears; **Copy** or **Use in AI Input** |
| **Weather** | Dropdown of states (all Indian states / UTs built in, plus any extra places you type), default location, °C / °F. Shows current weather, humidity, wind and a 4-day forecast |
| **AI Input / AI Output** | An input box with an action picker (Summarize, Translate, Explain, Extract, Person, Company, Ask AI), a **language picker with 85 languages** (Translate → "translate to"; Summarize / Explain / Extract → "answer in"; *Auto language* keeps the text's language) and an output box. With **Auto-fill input from selected text** ticked, highlighted text fills the box. Choosing *Translate* with **Replace on page** ticked replaces the text on the page itself, with **Undo** |

**Resize anything:** hover a widget and drag the little handle in its bottom-right corner - buttons, forms, cards and fields all resize freely. The size is saved; **double-click the handle** to go back to automatic size. Inline widgets can be moved with **Move**, floating ones are dragged by their header.

Widgets are saved per page address and re-attach after a reload or when a single-page app re-renders. Limit: 30 per page; top frame only (not inside iframes).

**Weather** uses the free Open-Meteo service (no API key). The extension's service worker calls it directly with Chrome's own network (so your company proxy / certificates just work); if that fails it falls back to the backend `GET /api/weather`. With `MOCK_MODE=true` the backend returns fake data so you can test offline.

**Form submissions** are stored in the local SQLite file `backend/data/` with the page URL and title. View or clear them in **History → Forms**. Sent / failed e-mails are listed in **History → E-mails**.

## 7c. E-mail setup for the Escalate button

The button calls `POST /api/send-email`; the backend sends the mail over SMTP. Put your mail server in `backend/.env` and restart uvicorn:

```
# Gmail (turn on 2-step verification, then create an "App password": Google Account -> Security)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM=Orbit <you@gmail.com>
```

* **Office 365:** `SMTP_HOST=smtp.office365.com`, port 587, `starttls`, your mailbox and password (SMTP AUTH must be allowed by your admin).
* **Company relay without login:** set `SMTP_HOST`, `SMTP_PORT=25`, `SMTP_SECURITY=none`, leave user/password empty.
* **No SMTP yet?** With `MOCK_MODE=true` the button works in *demo mode*: nothing is sent, the dialog says so, and the mail is listed in History → E-mails.
* Safety: addresses are validated, subject line breaks are removed, and there are limits (30 e-mails per hour, 5 per recipient per hour - `MAX_EMAILS_PER_HOUR`, `MAX_EMAILS_PER_RECIPIENT_HOUR`).

## 7d. How OCR works

* **Offline engine:** `npm run build` copies Tesseract (worker, WebAssembly core, English data, about 8 MB) from `node_modules` into `extension/dist/ocr`. The service worker runs it in a hidden *offscreen document*, so web pages never see your images and no internet is needed. First use takes a second or two to start.
* **Other languages:** use the *AI vision* engine (needs `GEMINI_API_KEY`), or add more Tesseract language files (`npm i @tesseract.js-data/hin`, copy its `.traineddata.gz` into `dist/ocr/lang` via `scripts/copy-ocr.mjs`, and change `'eng'` to `'eng+hin'` in `src/offscreen.ts`).
* Capture uses `chrome.tabs.captureVisibleTab`, so only the **visible** part of the page can be selected - scroll the picture into view first.
* Tip for accuracy: select tightly around the text; the tool enlarges small selections automatically.

## 8. Extending it (the PixieBrix-style part)

* **New action:** add an entry to `ACTIONS` in `backend/main.py` (id, label, instruction) and add the id to `ActionId` there, in `extension/src/shared/types.ts`, and in `ACTIONS` in `extension/src/sidepanel/lib/workflows.tsx`.
* **New workflow / site-specific button set:** add an item to `WORKFLOWS` in `workflows.tsx` with a URL `match` regex and the ordered list of action ids. Users can also switch workflow from the *Workflow* dropdown above the buttons.
* **Limit where the extension runs:** in `public/manifest.json` replace `http://*/*`, `https://*/*` in both `content_scripts.matches` and `host_permissions` with your enterprise domains (e.g. `https://*.mycrm.com/*`). Keep the `localhost:8000` entries.
* **Different model:** change `GEMINI_MODEL` in `.env`.

## 9. Why no certificate is needed

* The backend listens on **plain HTTP at `localhost`**. Browsers treat `localhost` as a secure context, and the manifest grants `http://localhost:8000/*` in `host_permissions`.
* All backend calls are made by the **service worker**, not by the web page, so HTTPS sites (your CRM) never hit a mixed-content block.
* **CORS** is handled twice: the extension's host permission lets the service worker call the backend directly, and the Express backend also allows `chrome-extension://…` and `localhost` origins.
* The only outbound HTTPS is backend → Copilot Studio (Direct Line), which uses the normal public certificates already trusted by your OS. Nothing to install or trust.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Chip says **Backend offline** | Start the backend: `cd backend && npm run dev`; check http://localhost:8000/api/health; ⚙ Settings → Test connection. |
| `Copilot Studio is not configured` | Create `backend/.env` (copy `.env.example`), set `COPILOT_TOKEN_ENDPOINT` or `DIRECT_LINE_SECRET`, and restart the backend. |
| `Direct Line rejected the token` | Re-check the token endpoint / Direct Line secret in Copilot Studio → Settings → Channels. |
| `Copilot Studio rate limit reached` (429) | Wait a few seconds and retry. |
| "Orbit can't read this page" | `chrome://`, the Web Store and some PDFs are blocked by Chrome. Use a normal website. |
| Widgets tab buttons are grey | The active tab is a browser page (chrome://, Web Store). Switch to a normal website tab. |
| Widget disappeared after reload | It is saved per page address. If the site changed that part of the page, it shows "waiting for element…" in *On this page* - remove and place it again. |
| Weather says *could not load* | Chrome (and the backend as fallback) must reach `api.open-meteo.com` / `geocoding-api.open-meteo.com`. Open https://api.open-meteo.com in a tab to test; behind a firewall ask IT to allow it, or use `MOCK_MODE=true` for demo data. |
| Toolbar not visible on a website | Open the side panel → Widgets and tick *Show widget toolbar on websites*, then refresh the page. Not available on chrome:// pages. |
| OCR says *Either the '<all_urls>' or 'activeTab' permission is required* | You are running an old build - run `npm run build` and reload the extension. |
| OCR says *OCR engine did not answer* / *OCR failed* | Run `npm install` then `npm run build` (this copies `dist/ocr`), reload the extension at `chrome://extensions`. |
| Escalate shows *E-mail is not configured* | Add `SMTP_HOST` etc. to `backend/.env` (section 7c) and restart the backend, or set `MOCK_MODE=true` for demo mode. |
| Escalate shows *mail server rejected the login* | Gmail needs an **App password**, not your normal password. |
| Widget not placed inside an iframe | Widgets work in the main page only (not inside embedded iframes). |
| Highlighted text doesn't appear | Reload the tab once (needed only if the tab was open *before* the extension was loaded and auto-inject failed), or use *Full page*. |
| Backend call fails only on a corporate network | A proxy/firewall may block `generativelanguage.googleapis.com` - ask IT to allow it. |
| Changes not visible after rebuild | `chrome://extensions` → reload the extension, then reopen the panel. |

## 11. Security & privacy notes (POC)

* Page text is sent to your local backend and from there to the Gemini API. Do **not** use with data that policy forbids sending to Google. Consider Vertex AI / an approved endpoint for production.
* The backend binds to `127.0.0.1` only. Only a 500-character preview of the input and the AI output are logged to SQLite (form submissions are stored in full, as typed); delete via **History → Clear**.
* Page content is treated as untrusted in the prompt (basic prompt-injection hardening). Person / Company answers are based on the page text; any general knowledge is labelled *unverified*.
* The extension asks for access to all websites (`<all_urls>`) because widgets and OCR screenshots must work on any third-party site. E-mail content is sent through your own SMTP server only.
* Before wider rollout: restrict `matches` / `host_permissions`, add authentication to the API, and use a managed secret store instead of `.env`.
