"""Scanner service — auto-detect new games in bin/ directory."""
import os
import json
from database import get_db
from shared.game_util import inspect_zip, compute_sha256, get_zip_filesize


def scan_bin_directory(bin_dir, games_json_path):
    """Scan bin/ for new game ZIPs and add them to the database.

    Cross-references with games.json for metadata when possible.

    Returns:
        dict with found, new, updated counts
    """
    if not os.path.isdir(bin_dir):
        return {'error': 'bin/ directory not found', 'found': 0, 'new': 0, 'updated': 0}

    db = get_db()

    # Load games.json for metadata lookup
    games_json_data = {}
    if os.path.isfile(games_json_path):
        with open(games_json_path, encoding='utf-8') as f:
            data = json.load(f)
            games_json_data = data.get('games', {})

    # Get existing games
    existing = set()
    db_games = db.execute('SELECT identifier, sha256 FROM games').fetchall()
    db_sha256_map = {}
    for g in db_games:
        existing.add(g['identifier'])
        if g['sha256']:
            db_sha256_map[g['sha256']] = g['identifier']

    # Scan bin directory
    found = 0
    new = 0
    updated = 0

    for filename in os.listdir(bin_dir):
        if not filename.lower().endswith('.zip'):
            continue

        zip_path = os.path.join(bin_dir, filename)
        if not os.path.isfile(zip_path):
            continue

        found += 1
        identifier = os.path.splitext(filename)[0]

        if identifier in existing:
            continue

        # Check if this file matches a known SHA256 (renamed file)
        try:
            sha256 = compute_sha256(zip_path)
        except Exception:
            continue

        if sha256 in db_sha256_map:
            # File is already known under a different name
            continue

        # Check games.json for metadata
        json_info = games_json_data.get(identifier, {})
        if json_info:
            executable = json_info.get('executable', '')
            name_zh = json_info.get('name', {}).get('zh-Hans', identifier)
            name_en = json_info.get('name', {}).get('en')
            game_type = json_info.get('type')
            filesize = json_info.get('filesize', get_zip_filesize(zip_path))
            cover = json_info.get('coverFilename')
            release_year = json_info.get('releaseYear')
            has_metadata = 1
            source = 'games_json'
        else:
            # Auto-detect
            info = inspect_zip(zip_path)
            executable = info.get('executable', '')
            name_zh = identifier
            name_en = None
            game_type = None
            filesize = get_zip_filesize(zip_path)
            cover = None
            release_year = None
            has_metadata = 0
            source = 'scan'

        db.execute('''
            INSERT INTO games (identifier, name_zh, name_en, executable, type,
                sha256, filesize, cover_filename, release_year, has_metadata, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (identifier, name_zh, name_en, executable, game_type,
              sha256, filesize, cover, release_year, has_metadata, source))
        new += 1

    db.commit()
    return {'found': found, 'new': new, 'updated': updated, 'total': len(existing) + new}


def start_background_scanner(app, bin_dir, games_json_path):
    """Start a background thread that periodically scans for new games."""
    import threading
    import time

    def run_scanner():
        with app.app_context():
            while True:
                try:
                    result = scan_bin_directory(bin_dir, games_json_path)
                    if result.get('new', 0) > 0:
                        app.logger.info(
                            f"Scanner: found {result['found']} games, "
                            f"{result['new']} new, {result['updated']} updated"
                        )
                except Exception as e:
                    app.logger.error(f"Scanner error: {e}")

                time.sleep(app.config.get('SCAN_INTERVAL_SECONDS', 300))

    thread = threading.Thread(target=run_scanner, daemon=True, name='game-scanner')
    thread.start()
    return thread
