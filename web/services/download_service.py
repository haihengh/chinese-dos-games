"""Game download service — fetches missing game ZIPs from upstream mirrors.

Supports:
- Direct GitHub raw URLs
- ghproxy.net (China-friendly mirror)
- Custom base URL via GAME_DOWNLOAD_BASE env var
"""
import hashlib
import logging
import os
import shutil
import tempfile
import time
import requests
from config import Config

logger = logging.getLogger(__name__)

# ── Mirror configuration ──
# Default: direct GitHub. Set GAME_DOWNLOAD_BASE to override.
# Examples:
#   Inside China: export GAME_DOWNLOAD_BASE=https://ghproxy.net/https://raw.githubusercontent.com/rwv/chinese-dos-games/refs/heads/master/bin/
#   Self-hosted:  export GAME_DOWNLOAD_BASE=https://my-cdn.example.com/games/
_GITHUB_RAW = (
    'https://raw.githubusercontent.com/rwv/chinese-dos-games/refs/heads/master/bin/'
)

MIRRORS = [
    os.environ.get('GAME_DOWNLOAD_BASE', '').rstrip('/') + '/' if os.environ.get('GAME_DOWNLOAD_BASE') else None,
    _GITHUB_RAW,
]
MIRRORS = [m for m in MIRRORS if m]  # Filter out None entries

# Download timeout (seconds)
DOWNLOAD_TIMEOUT = int(os.environ.get('GAME_DOWNLOAD_TIMEOUT', '600'))


def _compute_sha256(filepath):
    """Compute SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()


def download_game(identifier, dest_dir, expected_sha256=None):
    """Download a game ZIP from upstream mirrors.

    Args:
        identifier: game identifier (filename without .zip)
        dest_dir: where to save the downloaded ZIP
        expected_sha256: optional, skip download if file with matching hash exists

    Returns:
        Path to downloaded ZIP file, or None if download failed.

    Raises:
        RuntimeError: all mirrors exhausted
    """
    dest_path = os.path.join(dest_dir, f'{identifier}.zip')
    os.makedirs(dest_dir, exist_ok=True)

    # Skip if already downloaded and hash matches
    if os.path.isfile(dest_path):
        if expected_sha256:
            actual = _compute_sha256(dest_path)
            if actual == expected_sha256:
                logger.info(f"Game {identifier}: already exists with matching SHA256")
                return dest_path
        else:
            logger.info(f"Game {identifier}: already exists (no hash check)")
            return dest_path

    # Try each mirror
    last_error = None
    for mirror in MIRRORS:
        url = mirror + identifier + '.zip'
        logger.info(f"Downloading {identifier} from {url} ...")

        try:
            resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT, stream=True)
            if resp.status_code == 200:
                # Stream to temp file then move atomically
                tmp = tempfile.NamedTemporaryFile(dir=dest_dir, delete=False, suffix='.tmp')
                try:
                    total = 0
                    for chunk in resp.iter_content(chunk_size=65536):
                        tmp.write(chunk)
                        total += len(chunk)
                    tmp.close()

                    # Verify hash if provided
                    if expected_sha256:
                        actual = _compute_sha256(tmp.name)
                        if actual != expected_sha256:
                            os.unlink(tmp.name)
                            logger.warning(
                                f"SHA256 mismatch for {identifier}: "
                                f"expected={expected_sha256[:12]}..., actual={actual[:12]}..."
                            )
                            continue  # Try next mirror

                    # Move to final destination
                    shutil.move(tmp.name, dest_path)
                    size_mb = total / 1048576
                    logger.info(f"Downloaded {identifier}: {size_mb:.1f} MB from {mirror}")
                    return dest_path
                except Exception:
                    if os.path.exists(tmp.name):
                        os.unlink(tmp.name)
                    raise

            elif resp.status_code == 404:
                logger.warning(f"Mirror {mirror}: {identifier}.zip not found (404)")
                last_error = f"Game '{identifier}' not found on any mirror"
                continue
            else:
                logger.warning(f"Mirror {mirror}: HTTP {resp.status_code}")
                last_error = f"HTTP {resp.status_code} from {mirror}"
                continue

        except requests.exceptions.Timeout:
            logger.warning(f"Mirror {mirror}: timeout")
            last_error = f"Download timeout from {mirror}"
            continue
        except requests.exceptions.ConnectionError as e:
            logger.warning(f"Mirror {mirror}: connection failed: {e}")
            last_error = f"Cannot connect to {mirror}"
            continue
        except Exception as e:
            logger.error(f"Mirror {mirror}: unexpected error: {e}")
            last_error = str(e)
            continue

    raise RuntimeError(last_error or f"Failed to download {identifier} from any mirror")


def is_game_available(identifier):
    """Quick check if a game is available locally or downloadable."""
    # Already downloaded?
    local_path = os.path.join(Config.BIN_DIR, f'{identifier}.zip')
    if os.path.isfile(local_path):
        return True

    # At least one mirror available?
    return len(MIRRORS) > 0
