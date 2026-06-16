"""Database connection and initialization."""
import sqlite3
import os
from flask import g


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


def init_db(app):
    """Initialize database with schema."""
    from config import Config

    # Ensure data directory exists
    os.makedirs(os.path.dirname(Config.DATABASE), exist_ok=True)

    conn = sqlite3.connect(Config.DATABASE)
    conn.row_factory = sqlite3.Row

    schema_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'data', 'schema.sql'
    )
    with open(schema_path, encoding='utf-8') as f:
        conn.executescript(f.read())

    conn.commit()
    conn.close()

    # Register teardown
    app.teardown_appcontext(close_db)
