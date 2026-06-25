# 🔍 Security Review — Chinese DOS Games Web App

## ✅ Things Done Right (No Issues)

| Area | What's Good |
|:---|:---|
| **SQL Injection** | All queries use parameterized `?` placeholders. No string concatenation anywhere. |
| **Password Hashing** | Uses `werkzeug.security.generate_password_hash` (bcrypt by default). |
| **JWT Tokens** | HS256 with proper expiry (72h), secret derived from `secrets.token_hex(32)` fallback. |
| **File Upload** | Accepts `.zip`, validates content via `inspect_zip`, stores in temp dir first, then moves to `bin/`. |
| **No Hardcoded Secrets** | API keys read from env vars, falls back gracefully to empty string. |

---

## ⚠️ Issues Found

### 1. Path Traversal — Game Identifier (Medium) 🔸
**Where:** `app.py:104`, `app.py:161-162`  
The game identifier comes directly from the URL path (`/games/<identifier>` and `/api/games/<identifier>/bundle`). Nothing prevents requests like:
- `/games/../config` → reads config data
- `/api/games/../0/api/games/-/save` → peeks at another user's saves (via identifier trick)

The identifier is used to look up the game, but the cover path also uses it to build the file path:
```python
cover_path = os.path.join(Config.IMG_DIR, identifier, game['cover_filename'])
```
If `identifier` is `../config`, it walks into `img/` subdirectories. Not critical (~50 games), but means any cover image in sibling directories would render correctly.

**Fix:** Validate identifier on entry or normalize the path:
```python
# In game_page / api_game_detail
identifier = identifier.strip('/')
```
Or add a regex constraint to the route:
```python
@app.route('/games/<path:identifier>')
```

### 2. No Rate Limiting (Low-Medium) 🎯
**Where:** All API endpoints (`app.py`)  
There's no rate limiting on any endpoint:
- `/api/auth/login` — brute-force password guessing is unlimited (though passwords only need 4 chars)
- `/api/ai/chat` — AI calls cost money, no throttle per user
- `/api/tts` — free but generates audio for every request

**Impact:** Someone can hammer login or drain your AI API quota. A casual site won't feel it, but if deployed publicly:

```python
# ~5 lines to add with flask-limiter
from flask_limiter import Limiter
limiter = Limiter(key_func=lambda: request.remote_addr)

@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("10/minute")
def api_login(): ...
```

### 3. JWT Secret Shared Across Users (Low) 👥
**Where:** `config.py:25`  
```python
JWT_SECRET = os.environ.get('JWT_SECRET', SECRET_KEY)
SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
```
The JWT secret and Flask `SECRET_KEY` are the same value. The secret regenerates on every restart, so all existing tokens become invalid after each deploy. Users have to re-login. Not a vulnerability per se, but annoying UX in production.

**Fix:** Set `JWT_SECRET` explicitly in Docker env or `.env`:
```yaml
environment:
  JWT_SECRET: "your-actual-secret-here"
```

### 4. AI Token Count Not Tracked (Low) 💰
**Where:** `ai_service.py:70-71`, `app.py:425`  
When using local AI (Ollama), the code sets `effective_key = 'ollama'` on line 71, but this is also used as the provider key later. If both Ollama and Anthropic are configured with no user key, it silently prefers Ollama — which is fine functionally, but the model name `'gemma4:e4b'` is hardcoded and might not exist if Ollama pulls a different model.

**Fix:** Validate the model exists before using it (or catch the error more specifically).

### 5. Save Data Has No Size Limit (Low) 💾
**Where:** `app.py:342-363`  
```python
save_bytes = base64.b64decode(data['save_data'])
```
There's no max size check on save data. A user could store a 50MB "save" per game. With ~100 games, that's 5GB of DB storage. The `MAX_CONTENT_LENGTH` is 200MB, so it won't overflow silently, but there's no per-save cap.

**Fix:** Add a reasonable limit:
```python
if len(save_bytes) > 5 * 1024 * 1024:  # 5MB max save
    return jsonify({'error': '存档太大，最大 5MB'}), 400
```

### 6. No Content-Type Validation on Cover Images (Very Low) 🖼️
**Where:** `app.py:170-171`  
```python
ext = os.path.splitext(game['cover_filename'])[1].lower()
mime = 'image/jpeg' if ext in ('.jpg', '.jpeg') else 'image/png'
```
If a game has a `.webp` cover, it's served as `image/png`. Works fine for browsers (they auto-detect), but technically wrong MIME type.

### 7. Silent Error on Bundle Creation (Very Low) 📦
**Where:** `app.py:204-217`  
When bundle creation fails, the error message is generic: `'Failed to create game bundle'`. The actual exception is logged but not returned to the user. Fine for production, but makes debugging harder if users report "game won't load."

---

## 📊 Summary Table

| Issue | Severity | Exploitability | Impact |
|:---|:---|:---|:---|
| Path traversal on game identifier | 🔸 Medium | Easy (guess URL) | Read cover images, minor data leak |
| No rate limiting | 🎯 Low-Medium | Trivial | AI cost drain, login brute-force |
| JWT secret resets on restart | 👥 Low | None (just UX) | Users must re-login after deploy |
| No save size limit | 💾 Low | Easy | Database bloat |
| Wrong MIME for webp covers | 🖼️ Very Low | N/A | Minor spec violation |
| Generic bundle error messages | 📦 Very Low | N/A | Debugging friction |

---

## 🏁 Verdict
The app is not hard to hack, but it's also not leaving the door wide open. The core paths (auth, SQL, file handling) are solid. The most impactful improvements would be:

1. **Add rate limiting** — 5 lines of code, prevents AI quota drain and login brute-force
2. **Validate game identifiers** — reject `..` and empty strings in URL params
3. **Cap save data size** — prevent DB bloat from fat saves

Want me to implement any of these fixes?