# api.spec
from PyInstaller.building.build_main import Analysis, PYZ, EXE, COLLECT

block_cipher = None

a = Analysis(
    ['api.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('plugins', 'plugins'),
        ('system_processes.txt', '.'),
    ],
    hiddenimports=[
        'flask',
        'flask_cors',
        'psutil',
        'win32api',
        'win32con',
        'win32gui',
        'win32process',
        'pywintypes',
        'pkg_resources.py2_compat',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon='App_Icon.png',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='api',
)
