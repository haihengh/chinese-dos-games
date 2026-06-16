-- Chinese DOS Games Web App Schema

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
