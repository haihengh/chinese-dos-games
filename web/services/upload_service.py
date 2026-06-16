"""Upload service — process user-uploaded game ZIPs."""
import os
import shutil
import uuid
from database import get_db
from shared.game_util import inspect_zip, compute_sha256, get_zip_filesize


def process_upload(file_storage, user_id, bin_dir, img_dir, temp_dir):
    """Process an uploaded game ZIP.

    Args:
        file_storage: Flask FileStorage object
        user_id: Uploader's user ID
        bin_dir: Path to bin/ directory
        img_dir: Path to img/ directory
        temp_dir: Path to temporary upload directory

    Returns:
        dict with success/error and identifier
    """
    os.makedirs(temp_dir, exist_ok=True)

    # Save to temp
    temp_filename = f'{uuid.uuid4().hex}.zip'
    temp_path = os.path.join(temp_dir, temp_filename)

    try:
        file_storage.save(temp_path)
    except Exception as e:
        return {'success': False, 'error': f'文件保存失败: {e}'}

    # Inspect ZIP
    info = inspect_zip(temp_path)
    if not info['executable']:
        os.remove(temp_path)
        return {'success': False, 'error': '无法在 ZIP 中找到可执行文件 (EXE/BAT/COM)'}

    # Determine game identifier from filename
    original_name = file_storage.filename or 'unknown.zip'
    identifier = os.path.splitext(original_name)[0].strip()
    if not identifier:
        identifier = f'uploaded_{uuid.uuid4().hex[:8]}'

    # Make identifier unique if it already exists
    db = get_db()
    existing = db.execute(
        'SELECT identifier FROM games WHERE identifier = ?', (identifier,)
    ).fetchone()
    if existing:
        identifier = f'{identifier}_{uuid.uuid4().hex[:6]}'

    # Compute hash and size
    sha256 = compute_sha256(temp_path)
    filesize = get_zip_filesize(temp_path)

    # Move to bin/
    dest_path = os.path.join(bin_dir, f'{identifier}.zip')
    shutil.move(temp_path, dest_path)

    # Insert into database
    db.execute('''
        INSERT INTO games (identifier, name_zh, executable, sha256, filesize,
            source, uploaded_by, has_metadata)
        VALUES (?, ?, ?, ?, ?, 'upload', ?, 0)
    ''', (identifier, identifier, info['executable'], sha256, filesize, user_id))
    db.commit()

    # Record upload
    db.execute('''
        INSERT INTO uploads (user_id, filename, identifier, status, filesize)
        VALUES (?, ?, ?, 'done', ?)
    ''', (user_id, original_name, identifier, filesize))
    db.commit()

    return {
        'success': True,
        'identifier': identifier,
        'executable': info['executable'],
        'filesize': filesize,
    }


def list_user_uploads(user_id):
    """List uploads by a user."""
    db = get_db()
    rows = db.execute(
        'SELECT * FROM uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
        (user_id,)
    ).fetchall()
    return [dict(r) for r in rows]
