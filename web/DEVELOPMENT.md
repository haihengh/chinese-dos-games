# Development Guide — 中文 DOS 游戏 Web 版

This guide covers development setup, architecture, and common tasks for contributing to the Chinese DOS Games web application.

## Prerequisites

- Python 3.10 or higher
- Basic understanding of Flask and SQLite
- Knowledge of HTML/CSS/JavaScript for frontend contributions

## Development Setup

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/rwv/chinese-dos-games.git
cd chinese-dos-games/web

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Initialize Database

```bash
# Start the server once to create the database
python app.py
# Press Ctrl+C to stop
```

### 3. Download Game Files (Optional)

To test with actual games, run in the parent directory:

```bash
cd ..
python download_data.py
cd web
```

### 4. Start Development Server

```bash
python app.py
# Visit http://localhost:5000
```

## Project Architecture

### Frontend (`static/`)

- **`js/game.js`** — Main game player logic
  - Bundle preparation and caching
  - Save/restore functionality
  - Player control handlers
  - Uses js-dos v8 via CDN

- **`js/app.js`** — Global app utilities
  - Authentication state management
  - Toast notifications
  - Fetch wrapper with auth headers

- **`js/auth.js`** — Login/register forms
  - Form validation
  - API calls to auth endpoints

- **`js/upload.js`** — Game upload handling
  - Drag-and-drop file handling
  - Multipart form submission

- **`css/main.css`** — Styling
  - Dark theme
  - Responsive layout
  - CSS Grid/Flexbox

- **`css/chat.css`** — AI chat panel styles
  - Fixed left overlay panel (360px, resizable)
  - Message bubbles, typing indicator, settings form
  - Mic permission help panel, TTS speaking animation

- **`js/chat.js`** — AI chat frontend (Wawa 🐱)
  - Chat panel with pin, resize, settings, keyboard blocker
  - Canvas screenshot via js-dos `ci.screenshot()` (WebGL-safe)
  - Game context injection (`window.GAME_META` → server)
  - Voice input (Web Speech API), voice output (Edge TTS + browser fallback)
  - TTS settings: Mandarin/Cantonese, male/female, adjustable rate
  - localStorage persistence: history, AI config, TTS prefs, pin state, panel width
  - Document-level capture-phase `keydown` blocker (no emulator pause needed)

### Backend (`services/`)

- **`download_service.py`** — Game-on-demand download
  - Multi-mirror: GitHub raw → ghproxy (China) → custom CDN
  - SHA256 verification, stream-to-temp, atomic move
  - Configurable via `GAME_DOWNLOAD_BASE` env var

- **`bundle_service.py`** — Game bundle creation
  - ZIP inspection and extraction
  - js-dos config injection (.jsdos/dosbox.conf)
  - Font embedding
  - Cache management

- **`save_service.py`** — Save state management
  - Per-user, per-game save persistence
  - BLOB storage in SQLite

- **`auth_service.py`** — User authentication
  - Registration and login
  - JWT token generation and validation
  - Password hashing (Werkzeug scrypt)

- **`upload_service.py`** — Game upload handling
  - File validation
  - Executable detection
  - SHA256 computation
  - Integration with game database

- **`scanner_service.py`** — Background game discovery
  - Scans `bin/` directory periodically
  - Auto-detects new games
  - Integrates with `games.json` metadata

- **`metadata_service.py`** — Wikipedia integration
  - Game information lookup
  - Metadata caching

- **`ai_service.py`** — AI chat proxy (Wawa)
  - Anthropic Claude API (native SDK) + OpenAI-compatible (HTTP REST)
  - Per-request API key/base URL/model overrides
  - Game context injection into system prompt (name, type, controls, cheats)
  - Screenshot with auto-retry for non-vision models (DeepSeek R1 fallback)
  - Detailed error passthrough from provider APIs

## Save Architecture (Critical!)

### How Saves Work

The save system depends on **consistent Bundle URLs**:

1. **Consistent URL**: All games always load from `/api/games/{GAME_ID}/bundle`
2. **js-dos Indexing**: js-dos uses the URL as a key to find saves in IndexedDB
3. **Local Storage**: Saves are in browser IndexedDB, no server sync

### Key Implementation Details

**File**: `web/static/js/game.js`

```javascript
// ALWAYS use BUNDLE_URL, never fallback to Blob URLs
const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;

// Both paths use the same URL
async function actionPickLocalFile() {
    // ... load local file ...
    await createDosPlayer(BUNDLE_URL);  // ← Consistent!
}

async function actionDownloadFromServer() {
    // ... download from server ...
    await createDosPlayer(BUNDLE_URL);  // ← Consistent!
}

// Use local IndexedDB only, no cloud sync
async function saveGame() {
    const changes = await dosCI.persist();  // ← Local save
}
```

### Why Consistent URL Matters

```
❌ BEFORE (Bug):
  Session 1: Save to Blob URL "blob:http://...abc123"
  Refresh → New session creates "blob:http://...xyz789"
  js-dos looks for saves with URL "xyz789" but they're keyed to "abc123"
  Result: Saves lost! ❌

✅ AFTER (Fixed):
  Session 1: Save to "/api/games/{ID}/bundle"
  Refresh → Same URL "/api/games/{ID}/bundle"
  js-dos finds saves with same URL
  Result: Saves restored! ✅
```

### Notification Suppression

js-dos may try to show cloud save notifications. These are suppressed in `game.js`:

```javascript
function suppressCloudSaveNotifications() {
    // Periodic scan for cloud save notifications
    const checkNotifications = setInterval(() => {
        // Remove elements with keywords like "browser", "login", "cloud"
    }, 300);

    // MutationObserver for real-time detection
    const observer = new MutationObserver((mutations) => {
        // Remove notifications as they're added to DOM
    });
}
```

## Common Development Tasks

### Running Tests

```bash
# Syntax check (JavaScript)
cd web/static/js
node -c game.js

# Can add unit tests in future
```

### Database Inspection

```bash
# Open SQLite database
sqlite3 web/data/games.db

# View schema
.schema

# Common queries
SELECT COUNT(*) FROM games;
SELECT COUNT(*) FROM users;
SELECT * FROM user_saves LIMIT 5;
```

### Debugging Backend

Add print statements or use a debugger:

```python
# In app.py or services
print(f"[DEBUG] {variable_name}")
import pdb; pdb.set_trace()
```

### Debugging Frontend

Use browser DevTools:

```javascript
// In game.js
console.log('[game.js] message');
debugger;  // Breakpoint
```

### AI Chat Architecture

The AI chat feature uses a **server-side proxy** pattern:

```
Browser (chat.js)
  → POST /api/ai/chat { messages, screenshot?, api_key?, provider?, model?, base_url? }
    → ai_service.py: chat_with_ai()
      → Anthropic SDK (native) or OpenAI REST API
    ← { reply, usage?, error? }
  ← Render message bubble + optional TTS
```

**Why server-side proxy?**
- Server can provide a default API key (set by admin)
- Users can override with their own key (stored in browser localStorage)
- API key never leaks to other users
- Single endpoint for both Anthropic and OpenAI-compatible providers

**Adding a new provider:**
1. Add provider handling in `ai_service.py` — create a `_call_PROVIDERNAME()` function
2. Update `_resolve_config()` to handle the new provider string
3. The frontend settings dropdown auto-populates from the provider list

### Adding a New Service

1. Create `services/new_service.py`
2. Define functions
3. Import in `app.py`
4. Add route(s) to `app.py`
5. Test via curl or browser

Example:

```python
# services/new_service.py
def my_function(param):
    return {'result': param}

# In app.py
from services.new_service import my_function

@app.route('/api/new-endpoint', methods=['GET'])
def api_new():
    result = my_function('value')
    return jsonify(result)
```

## Common Issues and Solutions

### "Bundle not found" Error

- Ensure `bin/<identifier>.zip` exists
- Check that `bundle_service.py` can read the ZIP
- Verify `BUNDLE_URL` is `/api/games/{GAME_ID}/bundle`

### Saves Not Persisting

- Check browser's IndexedDB is enabled
- Verify js-dos is using same `BUNDLE_URL` across sessions
- Look for "browser not login" notifications (should be suppressed)
- Check browser console for errors

### Authentication Issues

- Ensure JWT secret is consistent (in `config.py`)
- Check token expiry (default 72 hours)
- Verify `Authorization: Bearer <token>` header format

### Upload Failures

- Check file size (max 200MB)
- Ensure ZIP contains valid executable
- Verify write permissions on `bin/` and `img/` directories

### AI Chat Not Working

- Check that either `ANTHROPIC_API_KEY` env var is set, or user has configured their own key in settings
- The `/api/ai/status` endpoint shows whether the server key is configured
- Verify the AI provider API is accessible from the server (firewall, network)
- Check browser console for fetch errors to `/api/ai/chat`

### Voice Input Not Working

- **HTTPS required**: Browsers require HTTPS (or localhost) for microphone access
- Check `window.isSecureContext` in browser console — must be `true`
- If permission was previously denied, user must go to browser site settings to re-enable
- The chat panel shows an inline help card with step-by-step instructions when permission fails

## Code Style Guidelines

### Python
- Follow PEP 8
- Use meaningful variable names
- Add docstrings to functions
- Keep functions focused and small

### JavaScript
- Use `const`/`let`, avoid `var`
- Add console.log with module prefix: `console.log('[game.js] message')`
- Keep functions under 50 lines when possible
- Use arrow functions for callbacks

### HTML/CSS
- Use semantic HTML
- Keep CSS organized and commented
- Use CSS Grid/Flexbox for layouts
- Test responsive design

## Docker & Release

### Building the Docker image locally
```bash
docker build -t chinese-dos-games:dev .
docker run -p 5000:5000 chinese-dos-games:dev
```

### Game-on-demand architecture
```
User clicks game → GET /api/games/<id>/bundle
  → ZIP missing locally?
    → YES: download_service.py fetches from mirrors
      → GitHub raw → ghproxy (China) → custom CDN
      → SHA256 verify → save to bin/
    → NO: use cached ZIP
  → bundle_service.py: wrap in .jsdos
  → Return to js-dos emulator
```

### Release workflow
1. `git tag -a "vX.Y.Z" -m "Release vX.Y.Z"` — tag the version
2. `git push origin vX.Y.Z` — push the tag
3. `./release.sh X.Y.Z` — build multi-arch Docker, push to registries, create GitHub Release draft
4. Publish the draft at GitHub Releases
5. See `RELEASE.md` for full details

### Adding a China mirror
Set `GAME_DOWNLOAD_BASE` to a China-accessible URL when deploying for Chinese users:
```bash
# GitHub proxy
export GAME_DOWNLOAD_BASE=https://ghproxy.net/https://raw.githubusercontent.com/rwv/chinese-dos-games/refs/heads/master/bin/
```

## Performance Considerations

1. **Bundle Caching** — First load generates bundle, subsequent loads use cache
2. **IndexedDB** — Saves are local, no network overhead
3. **Metadata Cache** — Wikipedia lookups are cached in database
4. **Background Scanner** — Runs every 5 minutes, configurable in `config.py`

## Deployment

### Docker (recommended for users)
```bash
docker run -d -p 5000:5000 -v dos-games-bin:/app/bin rwv/chinese-dos-games:latest
```

### Native launchers
- Windows: double-click `start.bat`
- Mac/Linux: `./start.sh`

### Development server
```bash
cd web
pip install -r requirements.txt
python app.py --ssl
```

### Production
- Use production WSGI server (gunicorn, uWSGI) behind nginx
- Set `SECRET_KEY` and `JWT_SECRET` environment variables
- Set `ANTHROPIC_API_KEY` (optional — users can bring their own keys)
- Set `GAME_DOWNLOAD_BASE` for China-accessible game mirror
- Configure proper HTTPS/SSL (required for voice input)
- Set up database backups
- Mount `/app/bin`, `/app/web/jsdos_cache` as persistent volumes

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Test thoroughly
4. Submit a pull request
5. Ensure tests pass and code review is approved

For game contributions, see the main `CONTRIBUTING.md` in the repository root.

## Resources

- [Flask Documentation](https://flask.palletsprojects.com/)
- [js-dos v8](https://js-dos.com/) (DOS emulation wrapper)
- [DOSBox-X](https://dosbox-x.com/) (internal backend used by js-dos)
- [SQLite Documentation](https://www.sqlite.org/)
- [PyJWT](https://pyjwt.readthedocs.io/)
