# TP.ai Assist

A Chrome side panel + in-page widgets that sit on top of third-party enterprise websites and give
operations employees real-time AI help: summarize, translate, explain, extract key details,
person / company info, free-form Q&A, and AI-powered OCR - all backed directly by a **Microsoft
Copilot Studio** agent.

* **Extension only - no backend, no server to run, no database.** Everything happens inside the
  Chrome extension itself.
* **Stack:** React + TypeScript + Vite + Material UI, Manifest V3.
* **LLM:** Microsoft Copilot Studio agent, called directly from the extension over the Bot
  Framework Direct Line REST API.

---

## 1. Folder structure

```
pixiebrix-update-v3/
├── README.md
├── .gitignore
└── extension/                       # The entire project - a Chrome extension (MV3)
    ├── package.json, tsconfig.json
    ├── vite.config.ts               # build 1: side panel + service worker
    ├── vite.content.config.ts       # build 2: content script as a single file
    ├── copilot.config.json          # Copilot Studio Direct Line settings (see section 2)
    ├── brand.config.json            # product name / short name / theme color
    ├── scripts/                     # clean.mjs, dev.mjs, gen-brand.mjs, copy-ocr.mjs
    ├── offscreen.html               # hidden page that runs the offline OCR engine (Tesseract, WASM)
    ├── public/                      # manifest.json, icons, logo - copied as-is into dist/
    ├── dist/                        # build output - THIS is what you load into Chrome
    └── src/
        ├── background.ts            # service worker: message router + talks to Copilot Studio directly
        ├── background/
        │   └── copilot.ts           # Direct Line client (token/session/ask/translate/OCR) + the 8 action prompts
        ├── content.ts                # content script entry
        ├── content/                 # widgets.ts, picker.ts, builder.ts, ui/* (widget types), selection.ts...
        ├── shared/                  # types.ts, config.ts, draft.ts, utils.ts, weather.ts
        └── sidepanel/               # the React UI (App.tsx, components/, lib/)
```

## 2. One-time setup

```bash
cd extension
npm install
npm run build
```

This produces `extension/dist`. In Chrome: go to `chrome://extensions`, turn on **Developer
mode**, click **Load unpacked**, and select the `extension/dist` folder. That's it - no server to
start, no `.env` file, no database to manage.

### Configuring Copilot Studio

`extension/copilot.config.json` holds the Direct Line settings:

```json
{
  "tokenEndpoint": "https://....environment.api.powerplatform.com/powervirtualagents/botsbyschema/.../directline/token?api-version=2022-03-01-preview",
  "directLineBaseUrl": "https://europe.directline.botframework.com",
  "responseTimeoutMs": 30000,
  "pollIntervalMs": 500,
  "ocrCapabilityConfigured": true,
  "mockMode": false,
  "maxContextChars": 30000
}
```

- **`tokenEndpoint`** - Copilot Studio's own *public, no-secret* token-minting endpoint (Settings →
  Channels → "Mobile app" in Copilot Studio, or ask whoever administers the agent). This is safe to
  bake into the extension's code because it never carries a password/secret, the same way
  Microsoft's own embeddable Web Chat widget calls it directly from a browser.
- **Never put a `DIRECT_LINE_SECRET` here instead.** That *is* a real secret - anyone who unpacks
  this extension can read `copilot.config.json` (or the built `background.js`) directly, so a
  secret placed there is effectively public. Use the token endpoint, not the secret, for this
  architecture to be safe.
- Set `mockMode: true` to test the whole extension with canned answers, without a real Copilot
  connection.

After changing this file, run `npm run build` again and reload the extension.

## 3. How it works

```
 ┌─────────────────────┐                          ┌────────────────────────┐
 │  Web page            │ ───────────────────────▶ │  background.ts         │
 │  • content.ts        │                           │  (service worker)      │
 │  • widgets, picker,  │ ◀─────────────────────── │  • message router       │
 │    toolbar           │                          │  • background/copilot.ts│──▶ Copilot Studio
 └─────────────────────┘                          └────────────────────────┘      (Direct Line REST)
            ▲                                                  ▲
            │                                                  │
            └──────────────── side panel (React) ──────────────┘
```

1. The content script (`content.ts` + `content/*`) reads the page, places/manages in-page widgets,
   and handles drag-and-drop from the side panel's palette.
2. The side panel (`sidepanel/*`) is the React UI - choose an action, configure a widget, see
   what's placed on the current page.
3. `background.ts` (the service worker) routes messages between the two and is the only place
   that talks to Copilot Studio - see `background/copilot.ts`, which implements the full
   token → conversation → message → poll Direct Line lifecycle plus the 8 action prompts
   (summarize / translate / explain / extract / extract_ids / person / company / ask) and OCR.

No part of this talks to any server you run - Copilot Studio is the only external service
involved, and it's called straight from the browser.

## 4. Features

| Widget | What it does |
|---|---|
| **AI Input / AI Output** | A text box with an action menu (Summarize, Translate, Explain, Extract, Person, Company, Ask AI) and a box elsewhere on the page that shows its answer. |
| **Get IDs** | Pulls case/order/ticket/SOP-style identifiers off the current page, grouped and colour-coded by priority, with a hover card for details. |
| **Text / Text area / Dropdown / Checkbox / Radio** | Plain form fields, placeable inline or floating. Can be dropped right next to each other to form a row - see "Layout" below. |
| **Form** | Several fields + Submit. Validates and shows a success state; nothing is persisted anywhere (there's no backend to store it on). |
| **Link Button** | Opens any http(s) link, in the same tab or a new one. |
| **Weather** | Pick an Indian state (or type any place), see current + 4-day forecast. Fetched directly from Open-Meteo (free, no key). |
| **OCR** | *Offline* (built-in Tesseract, runs in the browser, English only) or *AI vision* (Copilot Studio reads the image directly, any language your agent supports). |

### Layout: side-by-side vs stacked

When you place a widget right next to an existing one, it can either join a horizontal row with
it or always stack on its own line:

- **Click-to-place**: choose "Side-by-side with nearby widgets" or "Always stack" in the
  properties panel before placing.
- **Drag-and-drop**: set the default via the checkbox at the bottom of the Widgets tab
  ("Drag-dropped widgets group side-by-side by default").

Side-by-side grouping only takes effect when the drop spot is immediately next to another widget;
otherwise it places normally regardless of the setting.

## 5. Development

```bash
cd extension
npm run dev        # watches and rebuilds on change
npm run typecheck  # tsc --noEmit
npm run build      # production build -> dist/
```

After `npm run dev` picks up a change, reload the extension at `chrome://extensions` (the content
script and service worker need an explicit reload; a page refresh alone only reloads the content
script, not the side panel or background worker).

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Status chip says **Not configured** | `tokenEndpoint` in `copilot.config.json` is empty - fill it in and rebuild. |
| AI action fails with a Direct Line / Copilot error | Check the token endpoint is still valid (Copilot Studio agents can be republished with a new one) and that the agent is published. |
| Drag-and-drop seems to do nothing | Reload the extension fully at `chrome://extensions` *and* hard-refresh the page tab - an extension reload alone leaves old content scripts orphaned on already-open tabs. |
| OCR (AI vision) says capability not configured | Set `ocrCapabilityConfigured: false` in `copilot.config.json` if your agent genuinely has no OCR-capable tool, or configure one in Copilot Studio and set it back to `true`. |
| Weather says "could not load" | The browser couldn't reach `api.open-meteo.com` - check network/firewall, or try `mockMode: true` to confirm the rest of the UI works. |

## 7. Security notes

- Page text and (for OCR) image bytes go straight from the browser to Copilot Studio's Direct
  Line API over HTTPS - nothing passes through any server you control.
- The token endpoint in `copilot.config.json` only ever issues short-lived, scoped tokens; it
  never exposes a long-lived secret. Still, anyone who has this extension's `dist` folder can call
  that endpoint directly, so don't point it at an agent you wouldn't want arbitrary people chatting
  with.
- There is no logging, no history, and no database - nothing about what users type or see is
  stored anywhere by this project.
