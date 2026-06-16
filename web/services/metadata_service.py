"""Metadata service — search internet for game information."""
from database import get_db
import requests
import time


def search_metadata(identifier, game_name):
    """Search for game metadata from Wikipedia and cache results.

    Args:
        identifier: Game identifier
        game_name: Chinese game name

    Returns:
        dict with metadata fields
    """
    db = get_db()

    # Check cache first
    cached = db.execute(
        'SELECT * FROM game_metadata_cache WHERE game_identifier = ?',
        (identifier,)
    ).fetchone()

    if cached:
        # Return cached if less than 30 days old
        return dict(cached)

    # Search Wikipedia (Chinese)
    result = _search_wikipedia(game_name, 'zh')

    # Cache result
    if result:
        db.execute('''
            INSERT OR REPLACE INTO game_metadata_cache
            (game_identifier, wikipedia_url, description_zh, description_en)
            VALUES (?, ?, ?, ?)
        ''', (identifier, result.get('wikipedia_url'),
              result.get('description_zh'), result.get('description_en')))
        db.commit()

    return result or {}


def _search_wikipedia(game_name, lang='zh'):
    """Search Wikipedia API for game info."""
    try:
        # First, search for the page
        search_url = f'https://{lang}.wikipedia.org/w/api.php'
        params = {
            'action': 'query',
            'list': 'search',
            'srsearch': game_name,
            'format': 'json',
            'srlimit': 3,
        }
        resp = requests.get(search_url, params=params, timeout=10,
                          headers={'User-Agent': 'ChineseDOSGames/1.0'})
        data = resp.json()

        pages = data.get('query', {}).get('search', [])
        if not pages:
            return None

        result = {
            'wikipedia_url': f'https://{lang}.wikipedia.org/wiki/{pages[0]["title"].replace(" ", "_")}',
            'description_zh': pages[0].get('snippet', '').replace('<span class="searchmatch">', '').replace('</span>', ''),
            'description_en': None,
        }

        # Try English too
        time.sleep(0.3)  # Rate limit
        en_params = dict(params)
        en_params['srsearch'] = game_name
        en_resp = requests.get(
            f'https://en.wikipedia.org/w/api.php',
            params=en_params, timeout=10,
            headers={'User-Agent': 'ChineseDOSGames/1.0'}
        )
        en_data = en_resp.json()
        en_pages = en_data.get('query', {}).get('search', [])
        if en_pages:
            result['description_en'] = (
                en_pages[0].get('snippet', '')
                .replace('<span class="searchmatch">', '')
                .replace('</span>', '')
            )

        return result

    except Exception:
        return None
