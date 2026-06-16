"""Auth service — user registration, login, JWT management."""
import jwt
import time
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db
from config import Config


def register_user(username, password):
    """Register a new user. Returns dict with token or error."""
    db = get_db()

    # Check if username exists
    existing = db.execute(
        'SELECT id FROM users WHERE username = ?', (username,)
    ).fetchone()
    if existing:
        return {'error': '用户名已存在'}

    # Create user
    password_hash = generate_password_hash(password)
    db.execute(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        (username, password_hash)
    )
    db.commit()

    user_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]

    # Generate token
    token = _generate_token(user_id, username, False)

    return {
        'token': token,
        'user': {'id': user_id, 'username': username, 'is_admin': False},
    }


def login_user(username, password):
    """Login user. Returns dict with token or error."""
    db = get_db()

    user = db.execute(
        'SELECT * FROM users WHERE username = ?', (username,)
    ).fetchone()

    if not user:
        return {'error': '用户名或密码错误'}

    if not check_password_hash(user['password_hash'], password):
        return {'error': '用户名或密码错误'}

    token = _generate_token(user['id'], user['username'], bool(user['is_admin']))

    return {
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'is_admin': bool(user['is_admin']),
        },
    }


def decode_token(token):
    """Decode and validate a JWT token. Returns payload dict or raises."""
    payload = jwt.decode(token, Config.JWT_SECRET, algorithms=['HS256'])
    return {
        'user_id': payload['user_id'],
        'username': payload['username'],
        'is_admin': payload.get('is_admin', False),
    }


def _generate_token(user_id, username, is_admin):
    """Generate a JWT token."""
    now = int(time.time())
    payload = {
        'user_id': user_id,
        'username': username,
        'is_admin': is_admin,
        'iat': now,
        'exp': now + (Config.JWT_EXPIRY_HOURS * 3600),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm='HS256')
