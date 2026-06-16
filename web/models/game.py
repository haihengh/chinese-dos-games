"""Game model — database operations for games."""
import json
from database import get_db


def load_games_from_json(games_json_path, img_dir):
    """Load games from games.json into the database.
    Only inserts games that don't already exist.
    """
    import os

    with open(games_json_path, encoding='utf-8') as f:
        data = json.load(f)

    db = get_db()
    inserted = 0
    updated = 0

    for identifier, info in data.get('games', {}).items():
        name_info = info.get('name', {})
        name_zh = name_info.get('zh-Hans', identifier)
        name_en = name_info.get('en', None)

        executable = info.get('executable', '')
        game_type = info.get('type', None)
        sha256 = info.get('sha256', None)
        filesize = info.get('filesize', None)
        cover = info.get('coverFilename', None)
        release_year = info.get('releaseYear', None)

        # Check if cover exists locally
        if cover:
            cover_path = os.path.join(img_dir, identifier, cover)
            if not os.path.isfile(cover_path):
                cover = None

        # Serialize complex fields as JSON
        keymaps = json.dumps(info.get('keymaps', {}), ensure_ascii=False) if info.get('keymaps') else None
        cheats = json.dumps(info.get('cheats', {}), ensure_ascii=False) if info.get('cheats') else None
        links = json.dumps(info.get('links', {}), ensure_ascii=False) if info.get('links') else None

        existing = db.execute(
            'SELECT identifier, has_metadata FROM games WHERE identifier = ?', (identifier,)
        ).fetchone()

        if existing:
            # Update metadata if from games.json
            if existing['has_metadata'] == 0:
                db.execute('''
                    UPDATE games SET
                        name_zh = ?, name_en = ?, type = ?, sha256 = ?,
                        filesize = ?, cover_filename = ?, release_year = ?,
                        keymaps = ?, cheats = ?, links = ?,
                        has_metadata = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE identifier = ?
                ''', (name_zh, name_en, game_type, sha256, filesize,
                      cover, release_year, keymaps, cheats, links, identifier))
                updated += 1
        else:
            db.execute('''
                INSERT INTO games (identifier, name_zh, name_en, executable, type,
                    sha256, filesize, cover_filename, release_year,
                    keymaps, cheats, links, has_metadata, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'games_json')
            ''', (identifier, name_zh, name_en, executable, game_type,
                  sha256, filesize, cover, release_year,
                  keymaps, cheats, links))
            inserted += 1

    db.commit()
    return inserted, updated


def list_games(page=1, per_page=48, game_type=None, search=None, sort='name'):
    """List games with optional filters and pagination."""
    db = get_db()

    conditions = []
    params = []

    if game_type:
        conditions.append("type = ?")
        params.append(game_type)

    if search:
        conditions.append("(name_zh LIKE ? OR name_en LIKE ? OR identifier LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Sort
    sort_map = {
        'name': 'name_zh COLLATE NOCASE',
        'year': 'release_year DESC',
        'size': 'filesize DESC',
        'newest': 'created_at DESC',
    }
    order = sort_map.get(sort, 'name_zh COLLATE NOCASE')

    # Count
    total = db.execute(
        f"SELECT COUNT(*) FROM games {where}", params
    ).fetchone()[0]

    # Paginate
    offset = (page - 1) * per_page
    rows = db.execute(
        f"SELECT * FROM games {where} ORDER BY {order} LIMIT ? OFFSET ?",
        params + [per_page, offset]
    ).fetchall()

    games = [_game_row_to_dict(r) for r in rows]

    total_pages = max(1, (total + per_page - 1) // per_page)

    return {
        'games': games,
        'page': page,
        'per_page': per_page,
        'total': total,
        'total_pages': total_pages,
    }


def get_game(identifier):
    """Get a single game by identifier."""
    db = get_db()
    row = db.execute(
        'SELECT * FROM games WHERE identifier = ?', (identifier,)
    ).fetchone()
    if not row:
        return None
    return _game_row_to_dict(row)


def get_game_types():
    """Get list of game types with counts."""
    db = get_db()
    rows = db.execute(
        "SELECT type, COUNT(*) as count FROM games WHERE type IS NOT NULL "
        "GROUP BY type ORDER BY count DESC"
    ).fetchall()
    return [{'type': r['type'], 'count': r['count']} for r in rows]


def insert_game(identifier, executable, **kwargs):
    """Insert a new game (from scan or upload)."""
    db = get_db()
    db.execute('''
        INSERT INTO games (identifier, name_zh, executable, type, sha256,
            filesize, cover_filename, release_year, has_metadata, source, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        identifier,
        kwargs.get('name_zh', identifier),
        executable,
        kwargs.get('type'),
        kwargs.get('sha256'),
        kwargs.get('filesize', 0),
        kwargs.get('cover_filename'),
        kwargs.get('release_year'),
        kwargs.get('has_metadata', 0),
        kwargs.get('source', 'scan'),
        kwargs.get('uploaded_by'),
    ))
    db.commit()
    return identifier


def update_game_metadata(identifier, **kwargs):
    """Update game metadata fields."""
    db = get_db()
    fields = []
    values = []
    for key in ['name_zh', 'name_en', 'type', 'release_year', 'cover_filename',
                'has_metadata', 'keymaps', 'cheats', 'links']:
        if key in kwargs and kwargs[key] is not None:
            fields.append(f"{key} = ?")
            values.append(kwargs[key])
    if fields:
        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(identifier)
        db.execute(
            f"UPDATE games SET {', '.join(fields)} WHERE identifier = ?",
            values
        )
        db.commit()


def _game_row_to_dict(row):
    """Convert database row to dict with parsed JSON fields."""
    game = dict(row)
    # Parse JSON fields if they exist
    for field in ['keymaps', 'cheats', 'links']:
        if game.get(field):
            try:
                game[field] = json.loads(game[field])
            except (json.JSONDecodeError, TypeError):
                game[field] = {}
        else:
            game[field] = {}
    return game
