"""Database connection and initialization."""
import sqlite3
import os
import logging
from flask import g

logger = logging.getLogger(__name__)

# Minimal schema as fallback — used when schema.sql is hidden by Docker volumes.
# Keep in sync with data/schema.sql.
# MUST match web/data/schema.sql exactly — used as fallback when file is hidden by volumes
_SCHEMA_FALLBACK = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    UNIQUE NOT NULL,
    password_hash   TEXT    NOT NULL,
    is_admin        INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
    identifier      TEXT PRIMARY KEY,
    name_zh         TEXT,
    name_en         TEXT,
    executable      TEXT    NOT NULL,
    type            TEXT,
    sha256          TEXT,
    filesize        INTEGER,
    cover_filename  TEXT,
    release_year    INTEGER,
    keymaps         TEXT,
    cheats          TEXT,
    links           TEXT,
    has_metadata    INTEGER DEFAULT 0,
    source          TEXT    DEFAULT 'scan',
    uploaded_by     INTEGER,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_games_type ON games(type);
CREATE INDEX IF NOT EXISTS idx_games_source ON games(source);
CREATE INDEX IF NOT EXISTS idx_games_has_metadata ON games(has_metadata);

CREATE TABLE IF NOT EXISTS user_saves (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    game_identifier TEXT    NOT NULL,
    save_data       BLOB,
    filesize        INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_identifier) REFERENCES games(identifier) ON DELETE CASCADE,
    UNIQUE(user_id, game_identifier)
);

CREATE TABLE IF NOT EXISTS uploads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    filename        TEXT,
    identifier      TEXT,
    status          TEXT    DEFAULT 'processing',
    error_msg       TEXT,
    filesize        INTEGER,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_metadata_cache (
    game_identifier TEXT PRIMARY KEY,
    wikipedia_url   TEXT,
    description_zh  TEXT,
    description_en  TEXT,
    developer       TEXT,
    publisher       TEXT,
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_identifier) REFERENCES games(identifier) ON DELETE CASCADE
);
"""


def get_db():
    """Get database connection for current request context."""
    if 'db' not in g:
        from config import Config
        g.db = sqlite3.connect(Config.DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


def close_db(e=None):
    """Close database connection."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def _read_schema_sql():
    """Read schema.sql from disk. Tries the data/ directory first, then a
    volume-safe location next to this file, then falls back to the embedded SQL."""
    # Primary: data/schema.sql (works in dev; may be hidden by Docker named volumes)
    schema_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'data', 'schema.sql'
    )
    if os.path.isfile(schema_path):
        with open(schema_path, encoding='utf-8') as f:
            return f.read()

    # Secondary: adjacent to this file (Docker: copied by Dockerfile, never hidden)
    alt_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'schema.sql'
    )
    if os.path.isfile(alt_path):
        logger.info("Using volume-safe schema.sql at %s", alt_path)
        with open(alt_path, encoding='utf-8') as f:
            return f.read()

    # Fallback: embedded SQL (guaranteed to work)
    logger.warning("schema.sql not found on disk — using embedded fallback schema")
    return _SCHEMA_FALLBACK


def init_db(app):
    """Initialize database with schema.

    Resilient to Docker named volumes hiding schema.sql:
    1. Tries data/schema.sql (dev path)
    2. Tries schema.sql next to this file (Docker volume-safe copy)
    3. Falls back to embedded SQL (always available)
    """
    from config import Config

    # Ensure data directory exists with correct permissions
    data_dir = os.path.dirname(Config.DATABASE)
    try:
        os.makedirs(data_dir, exist_ok=True)
    except OSError as e:
        logger.error("Cannot create data directory %s: %s", data_dir, e)
        raise

    try:
        conn = sqlite3.connect(Config.DATABASE)
        conn.row_factory = sqlite3.Row

        schema_sql = _read_schema_sql()
        conn.executescript(schema_sql)
        conn.commit()
        conn.close()

        logger.info("Database initialized at %s", Config.DATABASE)
    except Exception as e:
        logger.error("Database initialization failed: %s", e)
        raise

    # Register teardown
    app.teardown_appcontext(close_db)
