# TweetReply — Chrome extension (X / Twitter)

Browser extension that adds **AI-assisted replies** and optional **relationship hints** on [x.com](https://x.com). This folder is the **MV3** package loaded unpacked or zipped for the Chrome Web Store.

## Build

From the **repository root**:

```bash
npm run build:extension
npm run build:extension:popup
```

- **`extension/content/content.bundle.js`** — bundled from `content/content.js` (isolated world, `document_end`).
- **`extension/popup/popup.bundle.js`** — bundled from `popup/popup.js`.
- **`extension/content/follow-network-interceptor.js`** — **not** esbuild-bundled; loaded **verbatim** as a **MAIN** world `document_start` content script (page context: wraps `fetch` / `XMLHttpRequest`).

Load **this directory** (or your packaged output) at `chrome://extensions` → **Load unpacked**.

## Architecture (this release)

| Piece | Role |
| ----- | ---- |
| `manifest.json` | MV3: `content/follow-network-interceptor.js` with `"world": "MAIN"`, `document_start`; `content.bundle.js` + `content.css`, `document_end`. |
| `content/follow-network-interceptor.js` | Page world: intercepts X GraphQL URLs matching known operation path fragments; parses JSON for follow relationships; emits `postMessage` to the isolated content script. |
| `content/content.js` → `content.bundle.js` | Isolated world: UI injection (Suggest / Improve), `postMessage` listeners, relationship chip rendering. |
| `popup/` | Auth, usage, **Settings → Relationship hints** toggle (`chrome.storage.sync`). |

**Alt choices implemented:** **A1** (MAIN world content script, no async `<script src>` loader), **B1** (text chips), **C1** (sync + Settings), **E1** (this file). Reply-sent UI was **not** added (X already confirms sends in the UI).

## Features

- **AI replies:** Buttons and flows in the timeline / composer (see `content.js`).
- **Relationship hints:** Small labels (“Follows you” / “Not Follows you”) derived from **in-browser** X network responses. Toggle: **Settings → Relationship hints** (default **on**).

## Privacy

- Relationship data is processed **in your browser** from normal X traffic the page already loads. It is **not** sent to TweetReply servers for this feature.
- **No** bearer-token capture for private X APIs in this build.
- AI / auth flows that call **TweetReply** APIs follow the same rules as the web app (token in extension storage for authenticated features).

## Limitations

- X may **rename GraphQL operations**; path fragments in `INTERCEPT_PATTERNS` may need updates. Use DevTools → **Network** to find current URLs.
- **MAIN** world script requires a recent Chromium (MV3 `world: "MAIN"` support).

## Versioning

Bump **`manifest.json` → `version`** when shipping a new store build.

## Manual QA (X)

After changing intercept or UI code, run through:

1. **Home cold load** — open `x.com/home`, wait for feed; hints appear where the API exposes followed-by (if enabled).
2. **Scroll** — fast scroll; no flapping labels.
3. **Tweet detail** — open a tweet; relationships still make sense for visible authors.
4. **Navigation** — home → profile → home; no obviously stale wrong hint for the same user.
5. **Hard refresh** — relationship hints still populate after reload.
6. **Settings** — turn **Relationship hints** off; chips disappear; turn on; chips return after the next refresh cycle.

See also [tests/README.md](../tests/README.md) (extension manual QA section).
