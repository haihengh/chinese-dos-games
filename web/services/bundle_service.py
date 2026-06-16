"""Bundle service — converts game ZIPs to .jsdos format with dosbox.conf."""
import os
import zipfile
import shutil
import io
from shared.dosbox_conf import generate_dosbox_conf


def get_or_create_bundle(identifier, source_zip_path, executable, cache_dir, font_path=None):
    """Get or create a .jsdos bundle for a game.

    Returns the path to the cached .jsdos file.
    The .jsdos bundle is a ZIP containing:
      - .jsdos/dosbox.conf (generated)
      - (optionally) .jsdos/wenquanyi.ttf (Chinese font)
      - All original game files from the source ZIP
    """
    os.makedirs(cache_dir, exist_ok=True)

    bundle_path = os.path.join(cache_dir, f'{identifier}.jsdos')

    # Check if cache is valid (compare source SHA256)
    if os.path.isfile(bundle_path):
        # Use stored hash to validate
        hash_path = bundle_path + '.sha256'
        if os.path.isfile(hash_path):
            with open(hash_path, 'r') as f:
                cached_hash = f.read().strip()
            current_hash = _file_sha256(source_zip_path)
            if cached_hash == current_hash:
                return bundle_path

    # Generate the bundle
    _create_bundle(identifier, source_zip_path, executable, bundle_path, font_path)

    # Store hash for cache validation
    current_hash = _file_sha256(source_zip_path)
    with open(bundle_path + '.sha256', 'w') as f:
        f.write(current_hash)

    return bundle_path


def _create_bundle(identifier, source_zip_path, executable, output_path, font_path=None):
    """Create a .jsdos bundle by wrapping source ZIP with dosbox.conf."""
    has_font = font_path and os.path.isfile(font_path)
    dosbox_conf = generate_dosbox_conf(executable, has_ttf_font=has_font)

    # Read source zip
    with zipfile.ZipFile(source_zip_path, 'r') as src_zip:
        # Create output zip
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as dst_zip:
            # Add dosbox.conf
            dst_zip.writestr('.jsdos/dosbox.conf', dosbox_conf)

            # Add Chinese font if available
            if has_font:
                dst_zip.write(font_path, '.jsdos/wenquanyi.ttf')
                # Also place at root for DOSBox-X to find
                dst_zip.write(font_path, 'wenquanyi.ttf')

            # Copy all game files (skip existing .jsdos/ entries)
            for item in src_zip.infolist():
                if item.filename.startswith('.jsdos/'):
                    continue
                # Read and re-write to avoid compression issues
                data = src_zip.read(item.filename)
                dst_zip.writestr(item, data)

    return output_path


def _file_sha256(filepath):
    """Compute SHA256 hash of a file."""
    import hashlib
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            data = f.read(65536)
            if not data:
                break
            sha256.update(data)
    return sha256.hexdigest()
