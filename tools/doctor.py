#!/usr/bin/env python3
import argparse
import subprocess
import sys
import shutil
from datetime import datetime
from pathlib import Path
import json

#!/usr/bin/env python3
import argparse
import subprocess
import sys
import shutil
import json
import os
import tempfile
from datetime import datetime
from pathlib import Path

import re

SCRIPT_DIR = Path(__file__).parent
DOCTOR_DIR = SCRIPT_DIR.parent / '_doctor'
LATEST_DIR = DOCTOR_DIR / 'latest'
LATEST_DIR.mkdir(parents=True, exist_ok=True)

TIMESTAMP = datetime.now().strftime('%Y%m%d_%H%M%S')
RUN_DIR = LATEST_DIR / TIMESTAMP
RUN_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = RUN_DIR / 'doctor.log'
STRUCTURED_FILE = RUN_DIR / 'doctor.json'

def log(msg: str, level: str = 'INFO') -> None:
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    full_msg = f'[{timestamp}] [{level}] {msg}'
    print(full_msg, file=sys.stderr)
    with open(LOG_FILE, 'a') as f:
        f.write(full_msg + '\n')

def _result(name: str, status: str, details: str = '') -> dict:
    return {'name': name, 'status': status, 'details': details}

def run_cmd(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None, check: bool = True, capture_output: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, cwd=cwd, env=env or os.environ, check=check, capture_output=capture_output, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        log(f'Timeout: {" ".join(cmd)}', 'ERROR')
        sys.exit(1)

def fail(msg: str) -> None:
    log(msg, 'ERROR')
    sys.exit(1)

def check_env() -> dict:
    name = 'env'
    log('Running env checks')
    if not shutil.which('python3'):
        return _result(name, 'fail', 'python3 not found')
    py_ver = run_cmd(['python3', '--version'], check=False).stdout.strip()
    log(f'Python: {py_ver}')
    if not shutil.which('bun'):
        return _result(name, 'fail', 'bun not found')
    bun_ver = run_cmd(['bun', '--version'], check=False).stdout.strip()
    log(f'Bun: {bun_ver}')
    return _result(name, 'pass', f'python={py_ver} bun={bun_ver}')

def check_install_sanity() -> dict:
    name = 'install_sanity'
    log('Running install sanity')
    lock_files = ['package-lock.json', 'bun.lockb', 'bun.lock']
    has_lock = any((Path() / lock).exists() for lock in lock_files)
    if not has_lock:
        log('WARNING: No package-lock.json or bun.lockb found. Run `bun install` first.', 'WARN')
        return _result(name, 'warn', 'no lockfile')
    log('bun install sanity: lockfile present')
    return _result(name, 'pass', 'lockfile present')

def check_branding_gate() -> dict:
    name = 'branding'
    log('Running branding gate')
    forbidden = r'OpenAI|GPT|ChatGPT|x\.ai|Grok|OpenCode|opencode'
    cmd = ['grep', '-r', '-i', '-l', forbidden, 'packages/app', 'packages/ui']
    res = run_cmd(cmd, check=False, capture_output=True)
    hits = [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
    if hits:
        bad = [h for h in hits if 'LICENSE' not in h and 'credit' not in h.lower()]
        if bad:
            fail(f'Forbidden branding in UI: {bad}')
    log('Branding gate passed')
    return _result(name, 'pass', '')

def check_assets_gate() -> dict:
    name = 'assets'
    log('Running assets gate')
    app_pub = Path('packages/app/public')
    ui_ass = Path('packages/ui/src/assets')
    paths = [
        (app_pub, 'app_public'),
        (ui_ass, 'ui_assets'),
    ]
    for pth, label in paths:
        if not pth.exists():
            return _result(name, 'fail', f'{label} missing: {pth}')
        log(f'{label} exists')
    mf = app_pub / 'site.webmanifest'
    if not mf.exists():
        return _result(name, 'fail', f'Manifest missing: {mf}')
    try:
        data = json.loads(mf.read_text())
    except Exception as e:
        return _result(name, 'fail', f'Could not read manifest: {e}')
    if data.get('name') != 'OpenHei':
        return _result(name, 'fail', f'Manifest name "{data.get("name")}" != "OpenHei"')
    icons = [
        ui_ass / 'favicon' / 'web-app-manifest-192x192.png',
        ui_ass / 'favicon' / 'web-app-manifest-512x512.png',
    ]
    missing = [str(ic) for ic in icons if not ic.exists()]
    if missing:
        return _result(name, 'fail', f'Missing icons: {missing}')
    logo = Path('packages/console/app/public/email/logo.png')
    if not logo.exists():
        return _result(name, 'warn', f'Missing logo: {logo}')
    log('Assets files OK')
    return _result(name, 'pass', '')

def check_installer_gate() -> dict:
    name = 'installer'
    log('Running installer gate')
    res = run_cmd(['./install', '--help'], check=False, capture_output=True)
    out = (res.stdout + res.stderr).lower()
    out = ' '.join(out.split()).strip()
    if '--heidi-dang' not in out or 'openhei' not in out:
        return _result(name, 'fail', 'Installer --help missing --heidi-dang and/or openhei branding')
    log('Installer gate passed')
    return _result(name, 'pass', '')

def _parse_jsonc(text: str) -> dict:
    stripped = re.sub(r'(?<!["\w:])//.*?$', '', text, flags=re.MULTILINE)
    stripped = re.sub(r',\s*([}\]])', r'\1', stripped)
    return json.loads(stripped)

def check_defaults_gate() -> dict:
    name = 'defaults'
    log('Running defaults gate')
    errors = []

    # Check .opencode/opencode.jsonc
    cfg = Path('.opencode/opencode.jsonc')
    if not cfg.exists():
        return _result(name, 'fail', f'{cfg} not found')
    try:
        data = _parse_jsonc(cfg.read_text())
    except Exception as e:
        return _result(name, 'fail', f'Cannot parse {cfg}: {e}')

    agent = data.get('agent', {}).get('sisyphus', {})
    if not agent:
        errors.append('agent.sisyphus missing')
    else:
        if 'grok-4-1-fast' not in agent.get('model', ''):
            errors.append(f"agent.sisyphus.model={agent.get('model')!r}, expected grok-4-1-fast")
        if agent.get('mode') != 'primary':
            errors.append(f"agent.sisyphus.mode={agent.get('mode')!r}, expected primary")

    if data.get('default_agent') != 'sisyphus':
        errors.append(f"default_agent={data.get('default_agent')!r}, expected sisyphus")

    # Forbidden defaults: no GitHub Copilot or Anthropic Claude as default model
    model = data.get('model', '')
    forbidden = ['github/', 'copilot', 'claude', 'anthropic']
    for f in forbidden:
        if f in model.lower():
            errors.append(f'Forbidden default model: {model}')
            break

    # Check installer config template
    install = Path('install')
    if install.exists():
        src = install.read_text()
        if 'grok-2' in src and 'grok-4-1-fast' not in src:
            errors.append('Installer still references grok-2 instead of grok-4-1-fast')
        if '"mode": "subagent"' in src:
            errors.append('Installer uses mode=subagent instead of primary')

        # Check for hidden Unicode
        raw = install.read_bytes()
        for bad, label in [(b'\xc2\xa0', 'NBSP'), (b'\xe2\x80\x8b', 'ZWSP'),
                           (b'\xe2\x80\x8c', 'ZWNJ'), (b'\xe2\x80\x8d', 'ZWJ'),
                           (b'\xef\xbb\xbf', 'BOM'), (b'\xe2\x80\xae', 'RLO'),
                           (b'\xe2\x80\xad', 'LRO'), (b'\xe2\x80\xab', 'RLE'),
                           (b'\xe2\x80\xaa', 'LRE')]:
            if bad in raw:
                errors.append(f'Hidden Unicode ({label}) in install script')

    if errors:
        return _result(name, 'fail', '; '.join(errors))

    log('Defaults gate passed')
    return _result(name, 'pass', 'grok-4-1-fast, sisyphus primary, no forbidden defaults')

def check_typecheck() -> dict:
    name = 'typecheck'
    log('Running typecheck')
    res = run_cmd(['bun', 'turbo', 'typecheck'], check=False, capture_output=True)
    if res.returncode != 0:
        return _result(name, 'fail', res.stdout + '\n' + res.stderr)
    return _result(name, 'pass', 'typecheck passed')

def check_app_build() -> dict:
    name = 'web_build'
    log('Running web build')
    candidates = [
        (['bun', '--cwd', 'packages/app', 'run', 'build'], 'packages/app build'),
        (['bun', '--cwd', 'packages/app', 'run', 'build:web'], 'packages/app build:web'),
        (['bun', '--cwd', 'packages/web', 'run', 'build'], 'packages/web build'),
    ]
    for cmd, desc in candidates:
        res = run_cmd(cmd, check=False, capture_output=True)
        if res.returncode == 0:
            log(f'Build succeeded: {desc}')
            return _result(name, 'pass', desc)
    return _result(name, 'fail', 'No successful web build command')

def check_app_test_unit() -> dict:
    name = 'web_unit_tests'
    log('Running web unit tests')
    candidates = [
        (['bun', '--cwd', 'packages/app', 'run', 'test'], 'packages/app test'),
        (['bun', '--cwd', 'packages/app', 'run', 'test:unit'], 'packages/app test:unit'),
        (['bun', '--cwd', 'packages/web', 'run', 'test'], 'packages/web test'),
    ]
    for cmd, desc in candidates:
        res = run_cmd(cmd, check=False, capture_output=True)
        if res.returncode == 0:
            log(f'Tests succeeded: {desc}')
            return _result(name, 'pass', desc)
    return _result(name, 'warn', 'No unit tests ran successfully or no test scripts found')

def main() -> None:
    parser = argparse.ArgumentParser(description='Doctor: Pre-commit and full checks')
    parser.add_argument('--full', action='store_true', help='Run full checks (build/test)')
    args = parser.parse_args()

    log(f'Doctor run: full={args.full}')
    log(f'Log: {LOG_FILE}')

    results = []
    results.append(check_env())
    results.append(check_install_sanity())
    results.append(check_branding_gate())
    results.append(check_assets_gate())
    results.append(check_installer_gate())
    results.append(check_defaults_gate())
    results.append(check_typecheck())

    if args.full:
        results.append(check_app_build())
        results.append(check_app_test_unit())

    with open(STRUCTURED_FILE, 'w') as jf:
        json.dump({'timestamp': TIMESTAMP, 'results': results}, jf, indent=2)

    failed = [r for r in results if r.get('status') == 'fail']
    warned = [r for r in results if r.get('status') == 'warn']

    for r in results:
        log(f"{r.get('name')}: {r.get('status')} - {r.get('details')}")

    if failed:
        log(f'Failed checks: {[f["name"] for f in failed]}', 'ERROR')
        log(f'Structured log: {STRUCTURED_FILE}')
        sys.exit(2)
    if warned:
        log(f'Warnings: {[w["name"] for w in warned]}', 'WARN')
        log(f'Structured log: {STRUCTURED_FILE}')
        sys.exit(0)

    log('All checks passed')
    log(f'Structured log: {STRUCTURED_FILE}')
    sys.exit(0)

if __name__ == '__main__':
    main()
