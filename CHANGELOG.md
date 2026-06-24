# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- **AI Screenshot Capture (Black Screen)** — AI assistant can now see game screenshots properly
  - Previously: `canvas.toDataURL()` returned black images for js-dos WebGL canvas
  - Root cause: WebGL `preserveDrawingBuffer: false` (default) — drawing buffer cleared before read
  - Solution: Use js-dos native `ci.screenshot()` API which properly reads the WebGL buffer
  - Falls back to enhanced canvas scanning (all canvases in container) if native API unavailable
  - Last-good-screenshot cache as final fallback

- **Microphone Input** — Voice input now works from any hostname/IP
  - Previously: Web Speech API requires secure context, `http://127.0.0.1` not considered secure
  - Solution: Added `--ssl` flag for auto-generated self-signed certificate (HTTPS)
  - Installed `pyOpenSSL` dependency for `ssl_context='adhoc'`
  - Now accessible via `https://127.0.0.1:5000` or `https://<LAN-IP>:5000`

### Added
- **Chat Panel Pin** — Pin the AI chat panel to keep it open while playing
  - 📌 pin button in chat header — toggles stable/auto-hide modes
  - Pinned: backdrop hidden, clicking outside won't close, Escape won't close
  - Unpinned: original behavior (auto-hide on outside click)
  - State persisted to `localStorage.chat_pinned`

### Changed
- **Screenshot Capture Architecture**: Two-layer approach
  - Primary: `window.DOS.Game.captureScreenshot()` via js-dos `ci.screenshot()` (game.js)
  - Fallback: `captureScreenshot()` canvas scanning in chat.js
  - Both layers are async, with `await` at all call sites

- **Server Startup**: `python app.py --ssl` enables HTTPS
  - Default (no flag): HTTP on port 5000 (mic only works on `localhost`)
  - `--ssl`: HTTPS with auto-generated cert (mic works everywhere)
  - `--port N`: custom port

### Files Modified
- `web/static/js/game.js`
  - Added `captureGameScreenshot()` async function using `dosCI.screenshot()`
  - Exposed `window.DOS.Game` namespace (`captureScreenshot`, `dosCI` getter)
  - Added `lastGoodScreenshot` fallback cache

- `web/static/js/chat.js`
  - Rewrote `captureScreenshot()` as async, multi-method (native API → canvas scan → querySelector)
  - Added `isPinned` state, `togglePin()` function, pin button in header
  - Updated `togglePanel()` to suppress backdrop when pinned
  - Updated backdrop click, Escape key to respect pin state
  - All screenshot call sites now `await`

- `web/static/css/chat.css`
  - Added `#btn-chat-pin.active` style (amber glow)

- `web/app.py`
  - Changed `app.run()` to support `--ssl` and `--port` CLI arguments

### Dependencies
- Added `pyOpenSSL` (required for Flask `ssl_context='adhoc'`)
