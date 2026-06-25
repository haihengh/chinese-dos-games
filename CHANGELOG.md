# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] — 2025-06-25 (evening)

### Fixed
- **Ollama system prompt ignored**: Ollama's `/api/chat` has no top-level `system` field — the game-aware system prompt (personality + game context) was silently dropped. Now passed as `role: "system"` message. AI now correctly knows which game the user is playing.
- **Voice recognition language never updated**: Changing the input language in settings saved to `state.settings` but never updated `state.recognition.lang` — the speech engine was permanently stuck on `zh-CN`. Fixed to sync on save.
- **Voice recognition language fallback**: Added auto-fallback chain `yue-Hant-HK → zh-HK → zh-CN` when browser doesn't support the selected language code.
- **Docker login broken**: Three root causes:
  - Named volume at `/app/web/data` could hide `schema.sql` on first run (Docker Desktop Windows issue). Fixed with volume-safe copy at `/app/web/schema.sql` + embedded SQL fallback.
  - `/app/web/data` missing from `chmod 777` — non-root `dosgames` user couldn't create `games.db`. Added to Dockerfile.
  - `SECRET_KEY`/`JWT_SECRET` defaulted to empty string via `${VAR:-}` in compose files — `os.environ.get()` uses default only on absent keys, not empty ones. Changed to `or` pattern in config.py and removed `:-` suffix from compose files.
- **Cloud save upload broken**: `saveToCloud()` read from app's `STORE_SAVES` IndexedDB (always empty) instead of js-dos's actual `sockdrive` IndexedDB. Added `readSockdriveSave()`/`writeSockdriveSave()` that properly pack/unpack js-dos's internal save storage.
- **Base64 encoding crash on large saves**: `arrayBufferToBase64` used byte-by-byte loop (2M iterations for a 2MB save). Changed to 32KB chunked processing with `String.fromCharCode.apply`.
- **Save data corruption**: `subarray().buffer` returns the full buffer, not the slice — replaced with `slice().buffer` in sockdrive write path.

### Changed
- **TTS streaming**: Server now streams Edge TTS chunks directly (no buffering). Frontend split-chunk pre-fetching: next sentence's audio is downloaded while current plays. Default speech rate increased from `+15%` to `+25%`. TTS race condition fixed with `_ttsGen` cancellation counter.
- **Chat pin + TTS defaults**: `chat_pinned` and `chat_tts_enabled` now default to `true` (on) instead of `false`.

### Added
- **GPU acceleration compose files**: `docker-compose.local-ai.gpu-nvidia.yml` and `docker-compose.local-ai.gpu-amd.yml` — override files for GPU passthrough. Base compose stays CPU-only (works everywhere).
- **Apple Silicon Mac compose**: `docker-compose.local-ai.mac.yml` — dedicated compose for Mac where Docker has no GPU passthrough. Ollama runs natively (Metal GPU), dos-games stays in Docker.
- **Database resilience**: Three-tier schema loading (data/schema.sql → volume-safe copy → embedded SQL fallback). Proper error handling in `init_db()` with logging.

### Removed
- `version: "3.8"` from compose files (obsolete in Docker Compose v2+).
- `build: .` from compose files (images now pulled pre-built from Docker Hub; rebuild with `docker compose build` when needed).
- Duplicate SSL certificate warning in README.

## [Unreleased] — 2025-06-25 (morning)

### Fixed
- **Cantonese voice input**: Changed language code from `zh-HK` to `yue-Hant-HK` — the explicit BCP 47 tag for Cantonese (Yue Chinese, Traditional Han, Hong Kong). `zh-HK` is ambiguous and many browsers treat it as Mandarin with HK accent. Auto-migrates existing users. Kept `zh-HK` as fallback option.

### Added
- **Voice input language selector**: Chat settings now include a 🎤 语音输入 dropdown with 4 languages — 普通话 (zh-CN), 粵語 (zh-HK), 台灣國語 (zh-TW), English (en-US). Persisted to localStorage, used by `SpeechRecognition`.
- **Cloud save toggle**: Game toolbar now has a 💻 本地 / ☁️ 云端 save mode selector:
  - Local (default): `dosCI.persist()` → browser IndexedDB
  - Cloud: Upload save to server via `POST /api/games/<id>/save` (requires login)
  - Cloud load: Download save from server and write to IndexedDB for js-dos to restore
  - Cloud delete: `DELETE /api/games/<id>/save`
  - Mode persisted to `localStorage.dos_save_mode`
  - Auto-checks for existing cloud save on game page load

### Changed
- `web/static/js/chat.js`: `recognition.lang` now reads from settings instead of hardcoded `zh-CN`
- `web/static/js/game.js`: `saveGame()` dispatches to `saveToCloud()` when cloud mode active
- `web/templates/game.html`: Added save mode `<select>`, cloud load button 📥, updated button labels
- `web/static/css/main.css`: Added `.save-mode-select` styles

### Docker Fixes (v0.4.1 — v0.4.5)
Critical fixes for the Docker deployment, rolled out across five patch releases.

### Fixed
- **TTS (v0.4.5)**: Added missing `edge-tts` dependency to `requirements.txt`. Previously the `/api/tts` endpoint returned 500 errors because the package wasn't installed, causing the browser to fall back to its robotic built-in TTS. Now uses Microsoft neural Edge TTS voices (Mandarin/Cantonese, male/female).
- **Screenshot quality (v0.4.5)**: Canvas fallback method now uses JPEG 0.85 quality (was 0.6), matching the primary `ci.screenshot()` method. This was missed when quality was boosted earlier.
- **Game download mirror (v0.4.4)**: Default mirror changed from GitHub raw (which has no game files) to `https://dos-bin.zczc.cz/` — the same source used by `download_data.py`. Games now auto-download on first play without any configuration. Mirror fallback order: `GAME_DOWNLOAD_BASE` env var → `dos-bin.zczc.cz` → GitHub raw.
- **Cover images (v0.4.3)**: Added `COPY img/ /app/img/` to Dockerfile. Game cover images were not included in the Docker image — only `web/` and `games.json` were copied.
- **Persistent SSL cert (v0.4.2)**: Self-signed certificate now generated at Docker build time via `generate_cert.py` (using `cryptography`). 10-year validity, covers localhost/127.0.0.1/::1. Previously Flask used adhoc certs that regenerated on every restart — users had to accept the browser warning each time. Now it's a one-time accept.
- **pip install path (v0.4.1)**: Changed from `pip install --user` (packages under `/root/.local`, inaccessible to `dosgames` user because `/root` has 700 permissions) to `pip install --target=/install` with `PYTHONPATH=/install`. This caused `ModuleNotFoundError: No module named 'flask'` on container startup.

### Added
- `web/generate_cert.py` — self-signed cert generation script using `cryptography`

### Changed
- `Dockerfile`: multi-stage build with `--target=/install`, SSL cert generation, COPY img/
- `requirements.txt`: added `edge-tts>=6.1`
- `web/services/download_service.py`: default mirror → `dos-bin.zczc.cz`
- `web/static/js/game.js`: canvas fallback JPEG quality 0.6 → 0.85

## [Unreleased] — 2025-06-24

### AI Personality Presets
The AI assistant Wawa now supports multiple personality presets, selectable from the chat settings panel.

### Added
- **AI Personality Presets** — Two response styles for Wawa:
  - `wawa` (热情): The default warm, enthusiastic companion — full of personality, emoji, and encouragement
  - `wawa-concise` (简洁): A terse, no-fluff assistant — 1-3 sentences max, no emoji, no small talk, direct answers only
  - `/api/ai/personalities` endpoint returns available presets
  - Personality dropdown in chat settings, persisted to localStorage
  - `personality` field sent with every chat request; server maps to system prompt
  - `services/ai_service.py`: `PERSONALITY_PRESETS` dict, `get_system_prompt()` function

- **4K / High-DPI Display Scaling** — Game page auto-scales for large displays:
  - Baseline: 1920px viewport = 1.0x scale (1400px max-width)
  - Scales `.game-page` `max-width` proportionally up to 2.5x
  - Triggered on load and window resize
  - 4K displays (~2560px at 150% scaling) get ~1.33x, ultrawide/5K get more

- **Local Save Tracking** — Profile page now shows local IndexedDB saves:
  - `game.js`: `markGameSaved()` writes save metadata to `localStorage.saved_games_index`
  - `profile.html`: Reads `saved_games_index`, merges local saves with server saves
  - Local saves shown with 💻 icon, server saves with 🎮 icon
  - Total save count combines both sources
  - Save size and timestamp tracked per game

- **Chat UX Improvements**:
  - **Auto-open**: Chat panel opens by default on first visit; user can close it to dismiss permanently (preference stored in `localStorage.chat_default_open`)
  - **Better error messages**: Differentiated messages for network failures, HTTP 4xx, HTTP 5xx, generic errors
  - **Toggle persistence**: `togglePanel(forceOpen)` remembers user preference when manually toggled

### Changed
- **Profile page**: Save stats now include local browser saves alongside server saves
- **Chat settings**: Personality dropdown added between provider config and TTS settings
- **`chat_with_ai()` / `chat_with_claude()`**: Accept new `personality` parameter
- **Legacy `SYSTEM_PROMPT`**: Now a derived reference to `PERSONALITY_PRESETS['wawa']['prompt']` — use `get_system_prompt()` for new code

### Files Modified
| File | Key Changes |
|------|------------|
| `web/services/ai_service.py` | `PERSONALITY_PRESETS` dict, `get_personality_presets()`, `get_system_prompt()`, personality param in `chat_with_ai()` and `_build_system_prompt()` |
| `web/app.py` | `/api/ai/personalities` endpoint, `personality` field parsing in `/api/ai/chat` |
| `web/static/js/chat.js` | Personality dropdown in settings, `personality` in settings state, auto-open logic, improved error messages, `chat_default_open` localStorage key |
| `web/static/js/game.js` | `applyDisplayScale()` for 4K scaling, `markGameSaved()` for local save tracking, `SAVE_MARKER_KEY` constant |
| `web/static/css/main.css` | Comment noting JS display scaling on `.game-page` |
| `web/templates/profile.html` | Combined server + local saves display, `saved_games_index` parsing, source icons |

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

- **Profile Page Stats** — Rich user dashboard at `/profile`
  - Avatar, join date, admin badge
  - 3-card stat grid: saves count, uploads count, total save data size
  - Clickable saves list with game names, sizes, relative timestamps
  - Upload history with status badges (completed/processing/failed)

- **Layout Shift** — Page slides right when chat opens
  - `body.chat-open` → `padding-left: var(--chat-width)` with 0.3s CSS transition
  - `--chat-width` CSS variable synced with panel resize
  - Mobile (≤900px): no shift, panel overlays as full-width drawer

- **Docker Deployment** — Containerized one-command setup
  - Multi-stage Dockerfile (Python 3.11-slim, non-root user, health check)
  - `docker-compose.yml` with named volumes for persistent game/bin cache
  - `.dockerignore` excludes large game files and dev artifacts
  - Environment variables: `ANTHROPIC_API_KEY`, `GAME_DOWNLOAD_BASE`, `SECRET_KEY`

- **Game-on-Demand** — Automatic game download on first play
  - `download_service.py`: fetch missing games from GitHub raw / ghproxy / custom CDN
  - SHA256 verification, stream-to-temp-then-move, multi-mirror fallback
  - Bundle endpoint auto-downloads before creating .jsdos
  - `game.js`: auto-download UI with spinner instead of manual first-run card
  - No 35GB upfront download — each game fetched once, cached forever

- **Launcher Scripts** — Double-click to run
  - `start.bat` (Windows): checks Python, installs deps, generates SSL cert, opens browser
  - `start.sh` (Mac/Linux): same, cross-platform

- **Local AI Bundle (Ollama + Gemma 4 E4B)** — Run AI completely offline
  - `docker-compose.local-ai.yml`: adds ollama + auto-pulls gemma4:e4b on first start
  - Auto-detection: if `OLLAMA_BASE_URL` is set, defaults to local AI (no API key needed)
  - Gemma 4 E4B: 4.5B params, vision-capable, 128K context, ~3GB model
  - Falls back to cloud AI if local unavailable
  - `/api/ai/status` reports local AI availability; chat UI shows 🏠 indicator

- **Release Process**
  - `release.sh`: builds multi-arch Docker image, pushes to Docker Hub + GHCR, creates GitHub Release draft
  - `RELEASE.md`: full release documentation with manual steps, env vars, China mirror setup, user install commands

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
| `web/app.py` | `--ssl`/`--port` CLI args, `/api/tts` endpoint, enriched `/api/auth/me`, auto-download in bundle endpoint |
| `web/services/ai_service.py` | System prompt → Wawa, screenshot logging, DeepSeek retry, game context injection |
| `web/services/download_service.py` | **New** — Game-on-demand: multi-mirror download with SHA256 verification |
| `web/static/js/game.js` | `captureGameScreenshot()`, `window.DOS.Game` namespace, auto-download UI |
| `web/static/js/chat.js` | Async screenshot, pin, TTS rewrite, keyboard blocker, layout shift, clear cache, TTS voice config, game context |
| `web/static/css/chat.css` | Body shift, `--chat-width`, pin/TTS/clear-cache styles, responsive |
| `web/static/css/main.css` | Profile page: avatar, stats grid, save/upload lists, status badges |
| `web/templates/game.html` | `window.GAME_META` for game context injection |
| `web/templates/profile.html` | Complete rewrite with stats dashboard |
| `web/requirements.txt` | Added `pyOpenSSL>=23.0` |
| `Dockerfile` | **New** — Multi-stage Python 3.11-slim, non-root, health check |
| `docker-compose.yml` | **New** — One-command deployment with named volumes |
| `.dockerignore` | **New** — Exclude large game files, certs, dev artifacts |
| `start.bat` | **New** — Windows one-click launcher |
| `start.sh` | **New** — Mac/Linux one-click launcher |
| `release.sh` | **New** — Multi-arch build + push + GitHub Release |
| `RELEASE.md` | **New** — Full release process documentation |

### Dependencies
- `pyOpenSSL>=23.0` — Flask SSL + persistent cert generation
- `edge-tts` — Server-side neural TTS
- `cryptography` — Self-signed cert generation (pyOpenSSL dependency)
- `requests` — Game download HTTP client (already in requirements)
