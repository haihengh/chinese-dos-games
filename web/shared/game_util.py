"""Shared utility for working with game ZIP files."""
import zipfile
import os
import hashlib


def inspect_zip(zip_path):
    """Inspect a game ZIP to find the main executable.

    Priority: PLAY.BAT > any .BAT > largest .EXE > .COM > any file

    Returns:
        dict with: executable (str), files (list of names), has_dosbox_conf (bool)
    """
    exe_candidates = {'bat': [], 'exe': [], 'com': []}

    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            names = zf.namelist()
            has_dosbox_conf = '.jsdos/dosbox.conf' in names or 'dosbox.conf' in names

            for name in names:
                # Skip directories and hidden files
                base = os.path.basename(name)
                if not base or base.startswith('.'):
                    continue
                ext = os.path.splitext(base)[1].lower().lstrip('.')
                if ext in exe_candidates:
                    exe_candidates[ext].append(base)

            executable = _pick_executable(exe_candidates)
            return {
                'executable': executable,
                'files': names[:100],  # First 100 files for reference
                'file_count': len(names),
                'has_dosbox_conf': has_dosbox_conf,
            }
    except zipfile.BadZipFile:
        return {'executable': None, 'files': [], 'file_count': 0, 'has_dosbox_conf': False}


def _pick_executable(candidates):
    """Pick the best executable from candidates by priority."""
    # PLAY.BAT is the classic Chinese DOS game launcher
    play_bat = [b for b in candidates['bat'] if b.upper() == 'PLAY.BAT']
    if play_bat:
        return play_bat[0]

    # Any .BAT file
    if candidates['bat']:
        # Prefer shorter, simpler names (usually the main launcher)
        candidates['bat'].sort(key=len)
        return candidates['bat'][0]

    # .EXE files — pick the most likely main executable
    if candidates['exe']:
        # Filter out common setup/install executables
        setup_names = {'SETUP.EXE', 'INSTALL.EXE', 'SETUP', 'INSTALL',
                       'SETSOUND.EXE', 'CONFIG.EXE', 'SETSND.EXE',
                       'DOS4GW.EXE', 'UNIVBE.EXE'}
        main_exes = [e for e in candidates['exe'] if e.upper() not in setup_names]
        if main_exes:
            return main_exes[0]
        return candidates['exe'][0]

    # .COM files
    if candidates['com']:
        return candidates['com'][0]

    return None


def compute_sha256(filepath):
    """Compute SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            data = f.read(65536)
            if not data:
                break
            sha256.update(data)
    return sha256.hexdigest()


def get_zip_filesize(zip_path):
    """Get file size in bytes."""
    return os.path.getsize(zip_path)
