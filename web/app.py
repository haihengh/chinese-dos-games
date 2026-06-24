"""Chinese DOS Games Web App — Main Flask Application."""
import os
import sys

# Ensure web package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import (
    Flask, render_template, request, jsonify, send_file, g, redirect, url_for
)
from database import init_db, get_db
from config import Config


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Ensure required directories exist
    os.makedirs(Config.CACHE_DIR, exist_ok=True)
    os.makedirs(Config.UPLOAD_TEMP, exist_ok=True)
    os.makedirs(os.path.dirname(Config.DATABASE), exist_ok=True)

    # Import models and services lazily to avoid circular imports
    from models.game import list_games, get_game, get_game_types, load_games_from_json
    from services.bundle_service import get_or_create_bundle

    # ─── Database init ───
    with app.app_context():
        # Create DB if it doesn't exist
        init_db(app)
        # Load games from games.json
        try:
            inserted, updated = load_games_from_json(Config.GAMES_JSON, Config.IMG_DIR)
            if inserted or updated:
                app.logger.info(f"games.json: {inserted} inserted, {updated} updated")
        except Exception as e:
            app.logger.warning(f"Could not load games.json: {e}")

    # ─── Auth helpers ───
    def get_current_user():
        """Get current user from JWT token, or None."""
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return None
        try:
            from services.auth_service import decode_token
            return decode_token(token)
        except Exception:
            return None

    def auth_required(f):
        """Decorator: require valid JWT."""
        from functools import wraps
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            g.current_user = user
            return f(*args, **kwargs)
        return decorated

    def admin_required(f):
        """Decorator: require admin user."""
        from functools import wraps
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user or not user.get('is_admin'):
                return jsonify({'error': 'Admin required'}), 403
            g.current_user = user
            return f(*args, **kwargs)
        return decorated

    # ─── Frontend Page Routes ───

    @app.route('/')
    def index():
        """Landing page with featured games."""
        page = request.args.get('page', 1, type=int)
        result = list_games(page=page, per_page=24, sort='newest')
        types = get_game_types()
        return render_template('index.html', games=result['games'],
                               types=types, total=result['total'])

    @app.route('/games')
    def games_page():
        """Game browser page."""
        game_type = request.args.get('type', '')
        search = request.args.get('search', '')
        sort = request.args.get('sort', 'name')
        page = request.args.get('page', 1, type=int)

        result = list_games(page=page, game_type=game_type or None,
                            search=search or None, sort=sort)
        types = get_game_types()
        return render_template('games.html', games=result['games'],
                               types=types, current_type=game_type,
                               search=search, sort=sort,
                               page=result['page'],
                               total_pages=result['total_pages'],
                               total=result['total'])

    @app.route('/games/<identifier>')
    def game_page(identifier):
        """Game player page."""
        game = get_game(identifier)
        if not game:
            return render_template('404.html', message=f'游戏 "{identifier}" 未找到'), 404
        return render_template('game.html', game=game)

    @app.route('/login')
    def login_page():
        return render_template('login.html')

    @app.route('/register')
    def register_page():
        return render_template('register.html')

    @app.route('/profile')
    def profile_page():
        return render_template('profile.html')

    @app.route('/upload')
    def upload_page():
        return render_template('upload.html')

    # ─── API: Games ───

    @app.route('/api/games')
    def api_games():
        """List games API."""
        game_type = request.args.get('type', '')
        search = request.args.get('search', '')
        sort = request.args.get('sort', 'name')
        page = request.args.get('page', 1, type=int)

        result = list_games(page=page, game_type=game_type or None,
                            search=search or None, sort=sort)
        return jsonify(result)

    @app.route('/api/games/<identifier>')
    def api_game_detail(identifier):
        """Single game details."""
        game = get_game(identifier)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
        return jsonify(game)

    @app.route('/api/games/<identifier>/cover')
    def api_game_cover(identifier):
        """Serve cover image."""
        game = get_game(identifier)
        if not game or not game.get('cover_filename'):
            # Return a placeholder
            return send_file(
                os.path.join(Config.BASE_DIR, 'static', 'img', 'no-cover.png'),
                mimetype='image/png'
            )

        cover_path = os.path.join(
            Config.IMG_DIR, identifier, game['cover_filename']
        )
        if not os.path.isfile(cover_path):
            return send_file(
                os.path.join(Config.BASE_DIR, 'static', 'img', 'no-cover.png'),
                mimetype='image/png'
            )

        ext = os.path.splitext(game['cover_filename'])[1].lower()
        mime = 'image/jpeg' if ext in ('.jpg', '.jpeg') else 'image/png'
        return send_file(cover_path, mimetype=mime)

    @app.route('/api/games/<identifier>/bundle')
    def api_game_bundle(identifier):
        """Serve .jsdos bundle for a game."""
        game = get_game(identifier)
        if not game:
            return jsonify({'error': 'Game not found'}), 404

        zip_path = os.path.join(Config.BIN_DIR, f'{identifier}.zip')
        if not os.path.isfile(zip_path):
            return jsonify({'error': 'Game file not found'}), 404

        try:
            bundle_path = get_or_create_bundle(
                identifier, zip_path, game['executable'],
                Config.CACHE_DIR, Config.FONT_PATH
            )
            return send_file(
                bundle_path,
                mimetype='application/zip',
                as_attachment=False,
                download_name=f'{identifier}.jsdos'
            )
        except Exception as e:
            app.logger.error(f"Bundle error for {identifier}: {e}")
            return jsonify({'error': 'Failed to create game bundle'}), 500

    @app.route('/api/games/types')
    def api_game_types():
        """Get game types with counts."""
        return jsonify(get_game_types())

    # ─── API: Auth ───

    @app.route('/api/auth/register', methods=['POST'])
    def api_register():
        """Register a new user."""
        from services.auth_service import register_user
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '')

        if not username or len(username) < 2 or len(username) > 30:
            return jsonify({'error': '用户名需要 2-30 个字符'}), 400
        if not password or len(password) < 4:
            return jsonify({'error': '密码至少需要 4 个字符'}), 400

        result = register_user(username, password)
        if result.get('error'):
            return jsonify(result), 400
        return jsonify(result), 201

    @app.route('/api/auth/login', methods=['POST'])
    def api_login():
        """Login and get JWT token."""
        from services.auth_service import login_user
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '')

        result = login_user(username, password)
        if result.get('error'):
            return jsonify(result), 401
        return jsonify(result)

    @app.route('/api/auth/me')
    @auth_required
    def api_me():
        """Get current user info with stats."""
        db = get_db()
        user_id = g.current_user['user_id']

        # Full user row (includes created_at)
        user = db.execute(
            'SELECT id, username, is_admin, created_at FROM users WHERE id = ?',
            (user_id,)
        ).fetchone()

        # Save stats
        saves = db.execute(
            'SELECT us.game_identifier, us.filesize, us.updated_at, g.name_zh, g.name_en '
            'FROM user_saves us LEFT JOIN games g ON us.game_identifier = g.identifier '
            'WHERE us.user_id = ? ORDER BY us.updated_at DESC',
            (user_id,)
        ).fetchall()

        # Upload stats
        uploads = db.execute(
            'SELECT id, filename, identifier, status, filesize, created_at '
            'FROM uploads WHERE user_id = ? ORDER BY created_at DESC',
            (user_id,)
        ).fetchall()

        total_save_size = sum(s['filesize'] or 0 for s in saves)

        return jsonify({
            'user_id': user['id'],
            'username': user['username'],
            'is_admin': bool(user['is_admin']),
            'created_at': user['created_at'],
            'stats': {
                'save_count': len(saves),
                'upload_count': len(uploads),
                'total_save_size': total_save_size,
            },
            'saves': [{
                'game_identifier': s['game_identifier'],
                'name': s['name_zh'] or s['name_en'] or s['game_identifier'],
                'filesize': s['filesize'] or 0,
                'updated_at': s['updated_at'],
            } for s in saves],
            'uploads': [{
                'id': u['id'],
                'filename': u['filename'],
                'identifier': u['identifier'],
                'status': u['status'],
                'filesize': u['filesize'] or 0,
                'created_at': u['created_at'],
            } for u in uploads],
        })

    # ─── API: Saves ───

    @app.route('/api/games/<identifier>/save', methods=['GET'])
    @auth_required
    def api_get_save(identifier):
        """Download user's save for a game."""
        from services.save_service import get_save, has_save
        if not has_save(g.current_user['user_id'], identifier):
            return jsonify({'error': 'No save found'}), 404

        save_data = get_save(g.current_user['user_id'], identifier)
        if not save_data:
            return jsonify({'error': 'No save found'}), 404

        from io import BytesIO
        return send_file(
            BytesIO(save_data),
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'{identifier}_save.zip'
        )

    @app.route('/api/games/<identifier>/save', methods=['POST'])
    @auth_required
    def api_save_game(identifier):
        """Upload save data for a game."""
        from services.save_service import save_game_state

        # Accept raw binary or multipart
        if request.content_type and 'application/json' in request.content_type:
            data = request.get_json()
            if data and 'save_data' in data:
                # Base64 encoded save from js-dos
                import base64
                save_bytes = base64.b64decode(data['save_data'])
            else:
                return jsonify({'error': 'No save data'}), 400
        else:
            save_bytes = request.get_data()
            if not save_bytes:
                return jsonify({'error': 'No save data'}), 400

        save_game_state(g.current_user['user_id'], identifier, save_bytes)
        return jsonify({'success': True, 'saved_at': None})  # Will be filled by DB

    @app.route('/api/games/<identifier>/save', methods=['DELETE'])
    @auth_required
    def api_delete_save(identifier):
        """Delete save for a game."""
        from services.save_service import delete_save
        delete_save(g.current_user['user_id'], identifier)
        return jsonify({'success': True})

    # ─── API: Upload ───

    @app.route('/api/upload', methods=['POST'])
    @auth_required
    def api_upload():
        """Upload a game ZIP."""
        from services.upload_service import process_upload

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file.filename or not file.filename.lower().endswith('.zip'):
            return jsonify({'error': 'Only .zip files are accepted'}), 400

        try:
            result = process_upload(
                file, g.current_user['user_id'],
                Config.BIN_DIR, Config.IMG_DIR, Config.UPLOAD_TEMP
            )
            return jsonify(result), 201 if result.get('success') else 400
        except Exception as e:
            app.logger.error(f"Upload error: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/uploads')
    @auth_required
    def api_user_uploads():
        """List user's uploads."""
        from services.upload_service import list_user_uploads
        return jsonify(list_user_uploads(g.current_user['user_id']))

    # ─── API: Metadata ───

    @app.route('/api/metadata/<identifier>')
    def api_metadata(identifier):
        """Search for game metadata from internet."""
        from services.metadata_service import search_metadata
        game = get_game(identifier)
        if not game:
            return jsonify({'error': 'Game not found'}), 404

        result = search_metadata(identifier, game.get('name_zh', identifier))
        return jsonify(result)

    # ─── API: AI Chat ───

    @app.route('/api/ai/status')
    def ai_status():
        """Return whether AI chat is available (server or user-provided key)."""
        return jsonify({
            'server_configured': bool(Config.ANTHROPIC_API_KEY),
            'server_model': Config.ANTHROPIC_MODEL,
            'user_can_configure': True,  # Users can always bring their own key
        })

    @app.route('/api/ai/chat', methods=['POST'])
    def ai_chat():
        """Proxy chat messages to AI API with optional screenshot.

        Accepts optional per-request overrides for user-provided API keys:
        - api_key: user's own API key
        - base_url: custom API base URL (for proxies/alternate providers)
        - model: model name override
        - provider: 'anthropic' (default) or 'openai' (OpenAI-compatible)
        """
        from services.ai_service import chat_with_ai

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400

        messages = data.get('messages', [])
        screenshot = data.get('screenshot', None)
        game_context = data.get('game_context', None)

        # Per-request AI config overrides (optional)
        api_key = data.get('api_key', '').strip() or None
        base_url = data.get('base_url', '').strip() or None
        model = data.get('model', '').strip() or None
        provider = data.get('provider', '').strip() or None

        # Validate provider
        if provider and provider not in ('anthropic', 'openai'):
            return jsonify({'error': f'Invalid provider: {provider}'}), 400

        if not messages or not isinstance(messages, list):
            return jsonify({'error': 'No messages provided'}), 400

        # Validate message format
        for msg in messages:
            if not isinstance(msg, dict) or 'role' not in msg or 'content' not in msg:
                return jsonify({'error': 'Invalid message format'}), 400
            if msg['role'] not in ('user', 'assistant'):
                return jsonify({'error': f"Invalid role: {msg['role']}"}), 400

        try:
            result = chat_with_ai(
                messages, screenshot,
                api_key=api_key, base_url=base_url,
                model=model, provider=provider,
                game_context=game_context,
            )
            if result.get('error'):
                app.logger.warning(f"AI chat service error: {result['error']}")
            return jsonify(result)
        except Exception as e:
            app.logger.error(f"AI chat error: {e}")
            return jsonify({
                'error': 'AI service error. Please try again later.',
                'reply': None,
            }), 500

    # ─── API: TTS (Text-to-Speech) ───

    @app.route('/api/tts', methods=['POST'])
    def api_tts():
        """Generate speech audio using Edge TTS (free neural voices).

        Accepts: { text: str, voice?: str, rate?: str }
        Returns: audio/mpeg binary (MP3)
        """
        import io
        import edge_tts

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400

        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        if len(text) > 5000:
            return jsonify({'error': 'Text too long (max 5000 chars)'}), 400

        voice = data.get('voice', 'zh-CN-XiaoxiaoNeural')
        rate = data.get('rate', '+10%')

        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            mp3_data = io.BytesIO()
            # edge-tts streams audio chunks; collect them all
            for chunk in communicate.stream_sync():
                if chunk['type'] == 'audio':
                    mp3_data.write(chunk['data'])
            mp3_data.seek(0)

            return send_file(
                mp3_data,
                mimetype='audio/mpeg',
                as_attachment=False,
                download_name='speech.mp3',
            )
        except Exception as e:
            app.logger.error(f"TTS error: {e}")
            return jsonify({'error': 'TTS generation failed'}), 500

    # ─── API: Admin ───

    @app.route('/api/admin/scan', methods=['POST'])
    @admin_required
    def api_admin_scan():
        """Trigger a manual scan of the bin/ directory."""
        from services.scanner_service import scan_bin_directory
        result = scan_bin_directory(Config.BIN_DIR, Config.GAMES_JSON)
        return jsonify(result)

    # ─── Error handlers ───

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Not found'}), 404
        return render_template('404.html', message='页面未找到'), 404

    @app.errorhandler(500)
    def server_error(e):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Internal server error'}), 500
        return render_template('404.html', message='服务器错误'), 500

    return app


# Create the app
app = create_app()

# Start background scanner for new game detection
try:
    from services.scanner_service import start_background_scanner
    start_background_scanner(app, Config.BIN_DIR, Config.GAMES_JSON)
    app.logger.info("Background scanner started")
except Exception as e:
    app.logger.warning(f"Background scanner not started: {e}")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--ssl', action='store_true', help='Enable HTTPS (needed for mic input on non-localhost)')
    parser.add_argument('--port', type=int, default=5000)
    args = parser.parse_args()

    ssl_context = None
    if args.ssl:
        cert_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'certs')
        cert_path = os.path.join(cert_dir, 'cert.pem')
        key_path = os.path.join(cert_dir, 'key.pem')

        if os.path.exists(cert_path) and os.path.exists(key_path):
            ssl_context = (cert_path, key_path)
            print(f'[SSL] Using certificate: {cert_path}')
        else:
            # Fallback to adhoc if cert files don't exist yet
            print('[SSL] No cert.pem/key.pem found in certs/, using adhoc. Run generate_cert.py first.')
            ssl_context = 'adhoc'

    app.run(debug=True, host='0.0.0.0', port=args.port, ssl_context=ssl_context)
