# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] — 2025-06-23

### AI Assistant Rebrand
The AI assistant has been renamed from "小龙" (Little Dragon) to **"Wawa"** with cat 🐱 theming throughout all code, UI, and documentation.

### Fixed
- **AI Screenshot — Black Screen** — AI assistant can now see game screenshots
  - Root cause: WebGL `preserveDrawingBuffer: false` — `canvas.toDataURL()` returned black
  - Solution: js-dos native `ci.screenshot()` API properly reads WebGL buffer
  - JPEG quality boosted from 0.6 → 0.85 (dark DOS game scenes compressed too aggressively)
  - Multi-layer fallback: native API → canvas scanning → last-good-screenshot cache
  - Diagnostic logging on client and server to track capture success

- **Microphone Input** — Voice input now works from any hostname/IP
  - Web Speech API requires secure context; `http://127.0.0.1` not considered secure
  - Solution: `--ssl` flag + persistent self-signed cert in `web/certs/`
  - Proper SubjectAlternativeNames; `pyOpenSSL` + `cryptography` for cert generation

- **Chat Text Input** — js-dos emulator was capturing all keyboard events
  - Solution: Document-level capture-phase `keydown` blocker with `stopImmediatePropagation()`
  - Game runs normally while typing — no emulator pausing needed
  - Removed `pauseForInput`/`resumeAfterInput` (caused game freeze)

- **Game Freeze During TTS** — Game stuck while AI responded and TTS spoke
  - Root cause: textarea kept focus after sending → emulator stayed paused
  - Solution: Blur textarea immediately after send; removed auto-refocus
  - Game resumes instantly after hitting Enter

- **DeepSeek API Compatibility**
  - `deepseek-reasoner` rejects `image_url` → auto-retry without screenshot
  - `detail` field compatibility issue → restored to `'auto'` (OpenAI default)
  - Better error detail from API responses shown to user

- **SSL Certificate Warning** — Browser "ERR_CERT_AUTHORITY_INVALID" on every restart
  - Persistent cert via `cryptography` in `web/certs/cert.pem` (10-year validity)
  - One-time Windows trust via `Import-Certificate` or `certlm.msc`

- **TDZ Crash** — Chat panel not opening after TTS settings addition
  - `const TTS_DEFAULT_VOICE` was declared after `state` initialization that used it
  - Moved TTS constants before `state` definition

### Added
- **Chat Panel Pin** — Keep chat open while playing
  - 📌/📍 button in header, emoji changes shape, amber glow + scale when pinned
  - Pinned: backdrop hidden, click-outside/Escape won't close
  - State persisted to `localStorage.chat_pinned`

- **Edge TTS Neural Voice** — High-quality free Chinese TTS
  - Server-side `/api/tts` endpoint using `edge-tts`
  - 4 voice presets: Mandarin Female/Male, Cantonese Female/Male
  - Configurable speech rate: -20% / +0% / +15% / +30%
  - Settings panel: 🔊 TTS section with voice and rate dropdowns
  - TTS button cycles: 🔇 Off → 🔊 Edge → 🔉 Browser (distinct icons per state)
  - Browser TTS fallback with improved rate (1.15) and voice selection

- **Clear All Cache** — One-click wipe in settings panel
  - Clears: all game chat histories, AI settings, TTS preferences, pin state, panel width
  - Detailed confirmation dialog; resets all UI to defaults

- **Game Context Injection** — AI automatically knows which game you're playing
  - `window.GAME_META` exposed in game.html: name, type, year, keymaps, cheats, executable
  - Sent with every chat request; injected into system prompt
  - AI understands controls, game genre, and history without user explanation

- **DeepSeek & OpenAI-compatible Improvements**
  - Auto-retry without screenshot when model lacks vision support (e.g. `deepseek-reasoner`)
  - Toast warning when screenshot is skipped due to model limitation
  - Better error messages: connection failures, timeouts, API errors shown with detail
  - `detail: 'auto'` for image_url (OpenAI default, better compatibility)
  - Placeholder hints for DeepSeek URL and model names in settings
  - Clears: all game chat histories, AI settings, TTS preferences, pin state, panel width
  - Detailed confirmation dialog; resets all UI to defaults

- **Profile Page Stats** — Rich user dashboard at `/profile`
  - Avatar, join date, admin badge
  - 3-card stat grid: saves count, uploads count, total save data size
  - Clickable saves list with game names, sizes, relative timestamps
  - Upload history with status badges (completed/processing/failed)

- **Layout Shift** — Page slides right when chat opens
  - `body.chat-open` → `padding-left: var(--chat-width)` with 0.3s CSS transition
  - `--chat-width` CSS variable synced with panel resize
  - Mobile (≤900px): no shift, panel overlays as full-width drawer

### Changed
- **Keyboard Architecture**: Document-level capture-phase blocker replaces emulator pausing
  - `_chatInputFocused` flag only; game never pauses for chat input
  - Textarea blurred after send; no auto-refocus

- **Screenshot Quality**: JPEG quality 0.6 → 0.85 across all capture methods

- **Server Startup**: `python app.py --ssl` uses persistent cert from `certs/`
  - Falls back to adhoc if cert files missing; `--port N` for custom port

- **Profile API** (`/api/auth/me`): Returns user stats, saves list, uploads list

- **AI Rebrand**: All 🐉→🐱, 小龙→Wawa across code, CSS, HTML, docs

### Files Modified
| File | Key Changes |
|------|------------|
| `web/app.py` | `--ssl`/`--port` CLI args, `/api/tts` endpoint, enriched `/api/auth/me` |
| `web/services/ai_service.py` | System prompt → Wawa, screenshot size logging |
| `web/static/js/game.js` | `captureGameScreenshot()` via `ci.screenshot()`, `window.DOS.Game` namespace, `pauseForInput`/`resumeAfterInput` |
| `web/static/js/chat.js` | Async screenshot, pin, TTS rewrite, keyboard blocker, layout shift, clear cache, TTS voice config |
| `web/static/css/chat.css` | Body shift, `--chat-width`, pin/TTS/clear-cache styles, responsive |
| `web/static/css/main.css` | Profile page: avatar, stats grid, save/upload lists, status badges |
| `web/templates/profile.html` | Complete rewrite with stats dashboard |
| `web/requirements.txt` | Added `pyOpenSSL>=23.0` |

### Dependencies
- `pyOpenSSL>=23.0` — Flask SSL + persistent cert generation
- `edge-tts` — Server-side neural TTS (already installed)
- `cryptography` — Self-signed cert generation (already a pyOpenSSL dependency)
