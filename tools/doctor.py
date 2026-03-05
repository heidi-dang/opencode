#!/usr/bin/env python3
import argparse
import subprocess
import sys
import shutil
from datetime import datetime
from pathlib import Path
import json
import os
import tempfile

SCRIPT_DIR = Path(__file__).parent
DOCTOR_DIR = SCRIPT_DIR.parent / '_doctor'
LATEST_DIR = DOCTOR_DIR / 'latest'
LATEST_DIR.mkdir(parents=True, exist_ok=True)

TIMESTAMP = datetime.now().strftime('%Y%m%d_%H%M%S')
LOG_FILE = LATEST_DIR / f'doctor_{TIMESTAMP}.log'

def log(msg: str, level: str = 'INFO') -> None:
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    full_msg = f'[{timestamp}] [{level}] {msg}'
    print(full_msg, file=sys.stderr)
    with open(LOG_FILE, 'a') as f:
        f.write(full_msg + '\n')

def run_cmd(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None, check: bool = True, capture_output: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, cwd=cwd, env=env or os.environ, check=check, capture_output=capture_output, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        log(f'Timeout: {" ".join(cmd)}', 'ERROR')
        sys.exit(1)
    try:
        return subprocess.run(cmd, cwd=cwd, check=check, capture_output=capture_output, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        log(f'Timeout: {" ".join(cmd)}', 'ERROR')
        sys.exit(1)

def fail(msg: str) -> None:
    log(msg, 'ERROR')
    sys.exit(1)

def check_env() -> None:
    log('Running env checks')
    if not shutil.which('python3'):
        fail('python3 not found')
    py_ver = run_cmd(['python3', '--version']).stdout.strip()
    log(f'Python: {py_ver}')
    if not shutil.which('bun'):
        fail('bun not found')
    bun_ver = run_cmd(['bun', '--version']).stdout.strip()
    log(f'Bun: {bun_ver}')

def check_install_sanity() -> None:
    log('Running install sanity')
    lock_files = ['package-lock.json', 'bun.lockb']
    has_lock = any((Path() / lock).exists() for lock in lock_files)
    if not has_lock:
        log('WARNING: No package-lock.json or bun.lockb found. Run `bun install` first.', 'WARN')
    else:
        log('bun install sanity: lockfile present')

def check_branding_gate() -> None:
    log('Running branding gate')
    forbidden = r'OpenAI|GPT|ChatGPT|x\.ai|Grok|OpenCode|opencode'
    cmd = ['grep', '-r', '-i', '-l', forbidden, 'packages/app/src/']
    res = run_cmd(cmd, check=False, capture_output=True)
    hits = [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
    if hits:
        bad = [h for h in hits if 'LICENSE' not in h and 'credit' not in h.lower()]
        if bad:
            fail(f'Forbidden branding in UI: {bad}')
    log('Branding gate passed')

def check_assets_gate() -> None:
    log('Running assets gate')
    app_pub = Path('packages/app/public')
    ui_ass = Path('packages/ui/src/assets')
    paths = [
        (app_pub, 'app_public'),
        (ui_ass, 'ui_assets'),
    ]
    for pth, name in paths:
        if not pth.exists():
            fail(f'{name} missing: {pth}')
        log(f'{name} exists')
    mf = app_pub / 'site.webmanifest'
    if not mf.exists():
        fail(f'Manifest missing: {mf}')
    data = json.loads(mf.read_text())
    if data.get('name') != 'OpenHei':
        fail(f'Manifest name "{data.get("name")}" != "OpenHei"')
    log('Manifests OK')
    icons = [
        ui_ass / 'favicon' / 'web-app-manifest-192x192.png',
        ui_ass / 'favicon' / 'web-app-manifest-512x512.png',
    ]
    for ic in icons:
        if not ic.exists():
            fail(f'Missing icon: {ic}')
    logo = Path('packages/console/app/public/email/logo.png')
    if not logo.exists():
        fail(f'Missing logo: {logo}')
    
    # Dims: identify (imagemagick dev tool)
    # logo 669x120, icons 192/512
    
    log('Assets files/dims OK (dims manual verify)')

def check_installer_gate() -> None:
    log('Running installer gate')
    res = run_cmd(['./install', '--help'], capture_output=True)
    out = res.stdout
    if not ('--heidi-dang' in out and 'OpenHei' in out):
        fail('Installer --help missing --heidi-dang and/or OpenHei branding')
    log('Installer gate passed')

def check_typecheck() -> None:
    log('Running typecheck')
    run_cmd(['bun', 'run', 'typecheck'])

def check_app_build() -> None:
    log('Running web build')
    run_cmd(['bun', '--cwd', 'packages/app', 'build'], capture_output=False)

def check_app_test_unit() -> None:
    log('Running web unit tests')
    run_cmd(['bun', '--cwd', 'packages/app', 'test:unit'], capture_output=False)

def check_installer_smoke() -> None:
    log('Running installer smoke (--heidi-dang)')
    tmp_home = tempfile.mkdtemp(prefix='doctor-smoke-home-')
    try:
        env = dict(os.environ)
        env['HOME'] = tmp_home
        res = run_cmd(['./install', '--heidi-dang'], cwd=Path.cwd(), env=env, timeout=300)
        bin_path = Path(tmp_home) / '.opencode' / 'bin' / 'opencode'
        if not bin_path.exists() or not os.access(str(bin_path), os.X_OK):
            fail(f'Smoke: binary missing/not exec: {bin_path}')
        ver_res = subprocess.run([str(bin_path), '--version'], capture_output=True, text=True, timeout=30)
        if ver_res.returncode != 0:
            fail(f'Smoke version fail: {ver_res.stderr}')
        log(f'Smoke binary OK: {ver_res.stdout.strip()}')
    finally:
        shutil.rmtree(tmp_home, ignore_errors=True)

def main() -> None:
    parser = argparse.ArgumentParser(description='Doctor: Pre-commit and full checks')
    parser.add_argument('--full', action='store_true', help='Run full checks (build/test)')
    args = parser.parse_args()

    log(f'Doctor run: quick={"No" if args.full else "Yes"}')
    log(f'Log: {LOG_FILE}')

    check_env()
    check_install_sanity()

    check_branding_gate()
    check_assets_gate()
    check_installer_gate()

    if args.full:
        check_typecheck()
        check_app_build()
        check_app_test_unit()
        check_installer_smoke()

    log('All checks passed')
    sys.exit(0)

if __name__ == '__main__':
    main()
