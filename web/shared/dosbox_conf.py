"""Generate dosbox.conf for js-dos .jsdos bundles.

DOSBox-X configuration for Chinese DOS games:
- TTF output mode (best for CJK, requires a TTF font file)
- Falls back to DBCS bitmap rendering if no TTF font available
- Code page 936 for Simplified Chinese
"""


def generate_dosbox_conf(executable, memsize=16, use_dosbox_x=True, has_ttf_font=False):
    """Generate a dosbox.conf tailored for Chinese DOS games.

    Args:
        executable: The executable filename (e.g. 'PLAY.BAT')
        memsize: Memory size in MB (default 16)
        use_dosbox_x: Enable DOSBox-X features for CJK support
        has_ttf_font: Whether a TTF font file is available in the bundle

    Returns:
        String containing the dosbox.conf content
    """
    lines = [
        '[sdl]',
        'output=opengl',
        'fullscreen=false',
        'autolock=true',
        '',
        '[dosbox]',
        'machine=svga_s3',
        f'memsize={memsize}',
        '',
        '[render]',
        'scaler=normal2x',
        'aspect=true',
        '',
        '[cpu]',
        'cycles=max',
        'core=auto',
        'cputype=auto',
        '',
        '[mixer]',
        'rate=22050',
        'blocksize=2048',
        'prebuffer=100',
        '',
        '[midi]',
        'mpu401=intelligent',
        'mididevice=default',
        '',
        '[sblaster]',
        'sbtype=sb16',
        'sbbase=220',
        'irq=7',
        'dma=1',
        'hdma=5',
        '',
    ]

    if use_dosbox_x:
        lines.extend([
            '[dosboxx]',
            '# Chinese language support',
            'language=chs',
            '# Use TTF output for best CJK rendering',
        ])
        if has_ttf_font:
            lines.extend([
                'ttf.font=wenquanyi.ttf',
                'ttf.fontsize=18',
                'ttf.script=auto',
                'ttf.output=all',
            ])
        else:
            lines.extend([
                '# No TTF font bundled — using bitmap DBCS fallback',
                'showdbcsdosv=true',
            ])
        lines.extend([
            '',
            '# DOS/V Chinese support for text-mode games',
            'dosv=chs',
            '',
        ])

    # Also set country/codepage for traditional DOSBox compatibility
    lines.extend([
        '[config]',
        'country=86,936',
        '',
    ])

    # Determine executable path
    import os
    exe_dir = os.path.dirname(executable)
    exe_name = os.path.basename(executable)

    autoexec = [
        '[autoexec]',
        '@echo off',
        'mount C .',
        'C:',
    ]

    if exe_dir:
        autoexec.append(f'cd {exe_dir}')

    autoexec.append(exe_name)
    autoexec.append('')

    lines.extend(autoexec)
    return '\n'.join(lines)


def generate_simple_conf(executable, memsize=16):
    """Generate a minimal dosbox.conf without DOSBox-X features.
    Used as fallback if DOSBox-X backend isn't available.
    """
    return generate_dosbox_conf(executable, memsize=memsize,
                                use_dosbox_x=False, has_ttf_font=False)
