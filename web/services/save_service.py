"""Save service — per-user game state persistence."""
from database import get_db


def save_game_state(user_id, game_identifier, save_bytes):
    """Save or update game state for a user."""
    db = get_db()

    existing = db.execute(
        'SELECT id FROM user_saves WHERE user_id = ? AND game_identifier = ?',
        (user_id, game_identifier)
    ).fetchone()

    if existing:
        db.execute('''
            UPDATE user_saves
            SET save_data = ?, filesize = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND game_identifier = ?
        ''', (save_bytes, len(save_bytes), user_id, game_identifier))
    else:
        db.execute('''
            INSERT INTO user_saves (user_id, game_identifier, save_data, filesize)
            VALUES (?, ?, ?, ?)
        ''', (user_id, game_identifier, save_bytes, len(save_bytes)))

    db.commit()


def get_save(user_id, game_identifier):
    """Get save data for a user's game. Returns bytes or None."""
    db = get_db()
    row = db.execute(
        'SELECT save_data FROM user_saves WHERE user_id = ? AND game_identifier = ?',
        (user_id, game_identifier)
    ).fetchone()
    return row['save_data'] if row else None


def has_save(user_id, game_identifier):
    """Check if a save exists."""
    db = get_db()
    row = db.execute(
        'SELECT id FROM user_saves WHERE user_id = ? AND game_identifier = ?',
        (user_id, game_identifier)
    ).fetchone()
    return row is not None


def delete_save(user_id, game_identifier):
    """Delete a save."""
    db = get_db()
    db.execute(
        'DELETE FROM user_saves WHERE user_id = ? AND game_identifier = ?',
        (user_id, game_identifier)
    )
    db.commit()
