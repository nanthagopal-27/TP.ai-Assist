# Deploying the backend to Render (so the client never runs it themselves)

Once this is done, the client only ever gets `extension/dist` - no `.env`, no `start.bat`, no
Node.js install. The backend runs permanently on Render instead.

## 1. Push the code to GitHub

Render deploys from a GitHub repo. This project is already a local git repo (first commit done).
You just need to push it:

1. Create a new (private is fine) repository on https://github.com/new - don't initialize it
   with a README, .gitignore, or license (this project already has those).
2. In a terminal, in this project folder, run:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

`.env` and the database are already excluded via `.gitignore` - they won't be pushed.

## 2. Create the Render web service

1. Go to https://render.com and sign up / log in (GitHub login is easiest - it also handles the
   repo connection for you).
2. Dashboard -> **New** -> **Web Service**.
3. Connect the GitHub repo you just pushed.
4. Fill in:
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (for testing) or Starter/$7-mo (recommended for the client, so it's
     always-on instead of sleeping after 15 minutes of inactivity)

## 3. Environment variables

In the same screen (or the service's **Environment** tab afterward), add these - copy the real
values from your local `backend/.env`, not from `.env.example`:

| Key | Value |
|---|---|
| `HOST` | `0.0.0.0` **(not** `127.0.0.1` **- see note below)** |
| `PRODUCT_NAME` | (from your `.env`) |
| `MOCK_MODE` | `false` |
| `MAX_CONTEXT_CHARS` | `30000` |
| `COPILOT_TOKEN_ENDPOINT` or `DIRECT_LINE_SECRET` | (whichever one your `.env` has filled in) |
| `DIRECT_LINE_BASE_URL` | (from your `.env`) |
| `COPILOT_RESPONSE_TIMEOUT_MS` | `30000` |
| `COPILOT_POLL_INTERVAL_MS` | `500` |
| `COPILOT_OCR_CAPABILITY_CONFIGURED` | `true` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | (from your `.env`, if email is used) |
| `MAX_EMAILS_PER_HOUR`, `MAX_EMAILS_PER_RECIPIENT_HOUR` | (from your `.env`) |

**Do NOT add a `PORT` variable.** Render assigns its own port automatically and the backend
already reads it correctly (`backend/src/config.ts`) - setting `PORT` yourself would override
Render's value and break the deploy.

**Why `HOST=0.0.0.0` matters**: the backend defaults to `127.0.0.1`, which only accepts
connections from inside the same machine. Render's proxy connects from outside the container, so
the server has to listen on `0.0.0.0` (all interfaces) to be reachable at all. Leaving this out is
the single most common reason a Render Node deploy looks "successful" in the logs but the URL
never responds.

## 4. Deploy and get the URL

1. Click **Create Web Service**. Render builds and starts it - watch the logs for
   `... backend listening on http://0.0.0.0:<port>`.
2. Once live, Render gives you a URL like `https://<something>.onrender.com`.
3. Sanity check it works: open `https://<something>.onrender.com/api/health` in a browser - you
   should see a JSON response like `{"status":"ok",...}`.

## 5. Point the extension at it

Give that URL back here (in chat) and the extension's default backend URL will be updated to it,
then rebuilt - after that, `extension/dist` alone (no backend setup) talks to your Render-hosted
backend automatically, no Settings configuration needed by the client.
