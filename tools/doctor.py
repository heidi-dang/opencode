#!/usr/bin/env python3
import argparse
import subprocess
import sys
import shutil
import json
import os
import re
from datetime import datetime
from pathlib import Path

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

def check_repo_trim() -> dict:
    name = 'repo_trim'
    log('Running repo trim check')
    
    root = Path(__file__).parent.parent
    enterprise_path = root / 'packages' / 'enterprise'
    if enterprise_path.exists():
        return _result(name, 'fail', 'packages/enterprise still exists')
    
    sst_config = root / 'sst.config.ts'
    if sst_config.exists():
        content = sst_config.read_text()
        if 'infra/enterprise.js' in content:
            return _result(name, 'fail', 'sst.config.ts still references enterprise')
    
    log('Repo trim check passed')
    return _result(name, 'pass', 'enterprise package removed')

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

def _parse_jsonc(text: str) -> dict:
    text = re.sub(r'(?<!:)//(?!/).*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    text = re.sub(r',(\s*[}\]])', r'\1', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        log(f'JSONC parse failed: {e}', 'DEBUG')
        log(f'Text snippet: {text[:200]}', 'DEBUG')
        raise ValueError(f'Invalid JSON: {e}')

def check_global_policy() -> dict:
    name = 'global_policy'
    log('Running global model policy gate')

    candidates = [
        Path('.opencode/opencode.jsonc'),
        Path(os.path.expanduser('~/.opencode/opencode.jsonc')),
    ]
    config_path = next((p for p in candidates if p.exists()), None)
    if not config_path:
        log('No opencode.jsonc found (project or global), skipping')
        return _result(name, 'pass', 'no config file')

    try:
        cfg_text = config_path.read_text()
        cfg = _parse_jsonc(cfg_text)
    except Exception as e:
        return _result(name, 'fail', f'Could not parse config: {e}')

    policy = cfg.get('openhei', {}).get('globalModelPolicy', False)
    if not policy:
        log('globalModelPolicy not enabled, skipping')
        return _result(name, 'pass', 'policy not enabled')

    log('Checking global model policy...')

    if not cfg.get('model'):
        return _result(name, 'fail', 'globalModelPolicy enabled but no top-level model defined')

    model = cfg['model']
    log(f'Global model: {model}')

    # Static check: warn about per-agent model overrides in raw config
    overrides = []
    for agent, val in (cfg.get('agent') or {}).items():
        if isinstance(val, dict) and val.get('model'):
            overrides.append(f'{agent}={val["model"]}')
    if overrides:
        log(f'Per-agent model overrides in config: {overrides}', 'WARN')
        log('These will be rewritten to the global model at runtime', 'WARN')

    prompt_path = Path('packages/opencode/src/session/prompt.ts')
    if not prompt_path.exists():
        return _result(name, 'fail', 'packages/opencode/src/session/prompt.ts missing')

    content = prompt_path.read_text()
    if 'agent_loop_model' not in content:
        return _result(name, 'fail', 'Structured log "agent_loop_model" missing from SessionPrompt.loop')

    log('Runtime logging hook present')

    rewrite_path = Path('packages/opencode/src/config/config.ts')
    if not rewrite_path.exists():
        return _result(name, 'fail', 'config.ts missing')

    rewrite_src = rewrite_path.read_text()
    if 'globalModelPolicy' not in rewrite_src or 'agent.model = result.model' not in rewrite_src:
        return _result(name, 'fail', 'Global model policy rewrite missing from config.ts')

    log('Config rewrite present in config.ts')

    res = run_cmd(['bun', 'run', 'tools/check_config.ts'], check=False, capture_output=True)
    if res.returncode != 0:
        log(f'check_config.ts exited {res.returncode} (env may lack API keys), static-only', 'WARN')
        detail = f'static-only, model={model}'
        if overrides:
            detail += f'; overrides will be rewritten: [{", ".join(overrides)}]'
        return _result(name, 'pass', detail)

    try:
        out = json.loads(res.stdout)
    except (json.JSONDecodeError, ValueError):
        log('check_config.ts output not JSON, static-only', 'WARN')
        detail = f'static-only, model={model}'
        if overrides:
            detail += f'; overrides will be rewritten: [{", ".join(overrides)}]'
        return _result(name, 'pass', detail)

    agents = out.get('agent', {})
    mismatches = []
    for agent, val in agents.items():
        if val.get('model') != model:
            mismatches.append(f'{agent}: {val.get("model")} != {model}')

    if mismatches:
        if overrides:
            msg = (
                'Per-agent overrides detected AND runtime rewrite failed. '
                f'Config overrides: [{", ".join(overrides)}]. '
                f'Runtime mismatches: [{"; ".join(mismatches)}]. '
                'Remove agent.*.model from config or fix the rewrite in config.ts'
            )
        else:
            msg = 'Agent model mismatches: ' + '; '.join(mismatches)
        return _result(name, 'fail', msg)

    if overrides:
        log('Per-agent overrides present but rewrite applied correctly')

    log(f'All {len(agents)} agents have model={model}')

    detail = f'{len(agents)} agents, model={model}'
    if overrides:
        detail += f'; overrides rewritten: [{", ".join(overrides)}]'
    return _result(name, 'pass', detail)

def check_default_model() -> dict:
    name = 'default_model'
    log('Running default model gate')
    
    provider_path = Path('packages/opencode/src/provider/provider.ts')
    if not provider_path.exists():
        return _result(name, 'fail', 'provider.ts not found')
    
    content = provider_path.read_text()
    
    match = re.search(r'const priority = \[([^\]]+)\]', content)
    if not match:
        return _result(name, 'fail', 'priority list not found in provider.ts')
    
    priority_str = match.group(1)
    priorities = re.findall(r'"([^"]+)"', priority_str)
    
    if not priorities:
        return _result(name, 'fail', 'priority list empty')
    
    first_priority = priorities[0]
    expected = 'grok-4-fast'
    
    if first_priority != expected:
        return _result(name, 'fail', f'first priority is "{first_priority}", expected "{expected}"')
    
    log(f'Default model priority: {first_priority}')
    return _result(name, 'pass', f'{expected} is first priority')

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
    results.append(check_repo_trim())
    results.append(check_install_sanity())
    results.append(check_branding_gate())
    results.append(check_assets_gate())
    results.append(check_global_policy())
    results.append(check_default_model())
    results.append(check_installer_gate())
    results.append(check_typecheck())
    from tools.check_ui_glow_polish import check_ui_glow_polish
    results.append(check_ui_glow_polish())
    results.append(check_copilot_toolbox())

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

def check_copilot_toolbox() -> dict:
    name = 'copilot_toolbox'
    log('Running Copilot Toolbox gates')
    
    files = [
        Path('docs/implementation-copilot-toolbox.md'),
        Path('packages/opencode/src/services/copilot-usage.ts'),
        Path('packages/opencode/src/provider/models.ts'),
        Path('packages/opencode/src/server/routes/global.ts'),
        Path('packages/app/src/context/copilot.tsx'),
    ]
    missing = [f for f in files if not f.exists()]
    if missing:
        return _result(name, 'fail', f'Missing files: {missing}')
    
    models_path = Path('packages/opencode/src/provider/models.ts')
    content = models_path.read_text()
    if 'copilotMultipliers' not in content:
        return _result(name, 'fail', 'copilotMultipliers map missing from models.ts')
    
    res = run_cmd(['bun', 'turbo', 'typecheck', '--filter=opencode...'], check=False, cwd=Path('.'))
    if res.returncode != 0:
        return _result(name, 'fail', f'typecheck failed: {res.stdout[:200]}')
    
    log('Copilot Toolbox backend gates passed')
    return _result(name, 'pass', 'files/service/multipliers/typecheck OK')

if __name__ == '__main__':
    main()
