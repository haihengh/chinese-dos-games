"""Application configuration."""
import os
import secrets


class Config:
    """Flask configuration."""
    # Paths
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(BASE_DIR)  # chinese-dos-games root
    BIN_DIR = os.path.join(PROJECT_ROOT, 'bin')
    IMG_DIR = os.path.join(PROJECT_ROOT, 'img')
    GAMES_JSON = os.path.join(PROJECT_ROOT, 'games.json')
    DB_PATH = os.path.join(BASE_DIR, 'data', 'games.db')
    CACHE_DIR = os.path.join(BASE_DIR, 'jsdos_cache')
    FONT_PATH = os.path.join(BASE_DIR, 'data', 'wenquanyi.ttf')
    UPLOAD_TEMP = os.path.join(BASE_DIR, 'uploads_temp')

    # Flask
    # Use `or` so empty-string env vars (from docker-compose ${VAR:-}) fall through
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    JSON_AS_ASCII = False  # Critical for Chinese character handling
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024  # 200MB max upload

    # JWT
    JWT_SECRET = os.environ.get('JWT_SECRET') or SECRET_KEY
    JWT_EXPIRY_HOURS = 72

    # js-dos CDN (v8)
    JSDOS_CSS = 'https://cdn.jsdelivr.net/npm/js-dos@8.3.20/dist/js-dos.css'
    JSDOS_JS = 'https://cdn.jsdelivr.net/npm/js-dos@8.3.20/dist/js-dos.js'

    # Scanner
    SCAN_INTERVAL_SECONDS = 300  # 5 minutes

    # AI / Chat
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
    ANTHROPIC_MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514')

    # Pagination
    GAMES_PER_PAGE = 48

    # Database
    DATABASE = DB_PATH
