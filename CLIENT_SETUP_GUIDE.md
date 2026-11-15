# TP.ai Assist - setup guide (no coding knowledge needed)

This has two parts that both need to be running: the **Chrome extension** (what you see in the
browser) and the **backend** (a small program running quietly in the background that it talks to
for AI replies, email and weather). Do both, in order, once.

## Part 1 - Install Node.js (one-time, like installing any program)

1. Go to https://nodejs.org
2. Download the **LTS** version for Windows and run the installer.
3. Click Next through the installer with the default options.

You only ever need to do this once on this computer.

## Part 2 - Start the backend

1. Open the `backend` folder you were given.
2. Make sure there's a file called `.env` in that folder (not `.env.example` - the real one, with
   the actual keys filled in). If you only see `.env.example`, ask whoever gave you this project
   for the real `.env` file and put it in the `backend` folder.
3. Double-click `start.bat`.
   - The first time, it will say "installing dependencies" and take a minute or two - that's
     normal, just wait.
   - After that, it will say `Starting TP.ai Assist backend on http://127.0.0.1:8000 ...`
4. **Leave that window open.** Closing it stops the backend, and the extension won't be able to
   get AI replies, weather or send email until you start it again.

You'll need to do this step every time you restart your computer and want to use the extension -
just double-click `start.bat` again.

## Part 3 - Load the Chrome extension

1. Open Chrome and go to: `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension/dist` folder you were given (the `dist` folder specifically, not the
   whole `extension` folder).
5. The extension icon should now appear in Chrome's toolbar.

You only need to do this once, unless you're given an updated `dist` folder later - then repeat
these steps with the new folder (or click the refresh icon on the extension's card in
`chrome://extensions`).

## Checking it's working

- With `start.bat`'s window open and showing no errors, open any normal website, click the
  extension's icon in the toolbar, and try an action from the side panel.
- If you see a message like "Cannot reach the backend" or "backend offline", check that the
  `start.bat` window is still open and didn't show an error.

## What NOT to touch

- Don't delete the `node_modules` folder inside `backend` - that's where all the backend's pieces
  live. If it ever goes missing, just double-click `start.bat` again and it will reinstall itself.
- Don't edit `.env` unless someone technical tells you to - it holds real credentials.
- There's no database file to manage - the backend creates its own (`backend/data/orbit.db`)
  automatically the first time it starts.
