from pathlib import Path
import re


def check_installer_plugin_fallback() -> dict:
    name = 'installer_plugin_fallback'
    path = Path('install')
    if not path.exists():
        return {'name': name, 'status': 'fail', 'details': 'install script not found'}

    src = path.read_text()

    if 'bun install --frozen-lockfile' not in src:
        return {'name': name, 'status': 'fail', 'details': 'missing frozen bun install attempt'}

    if 'retrying with non-frozen bun install' not in src or 'if ! bun install --frozen-lockfile; then' not in src:
        return {'name': name, 'status': 'fail', 'details': 'missing fallback to non-frozen bun install'}

    if 'merge_plugin_path_into_config' not in src or 'plugins.append(plugin_path)' not in src:
        return {'name': name, 'status': 'fail', 'details': 'missing local plugin path registration'}

    bad = [
        r'plugins\.append\("@heidi-dang/oh-my-opencode"\)',
        r"plugins\.append\('@heidi-dang/oh-my-opencode'\)",
        r'plugin_path\s*=\s*"@heidi-dang/oh-my-opencode"',
        r"plugin_path\s*=\s*'@heidi-dang/oh-my-opencode'",
    ]
    if any(re.search(p, src) for p in bad):
        return {'name': name, 'status': 'fail', 'details': 'found npm package plugin registration'}

    return {'name': name, 'status': 'pass', 'details': 'frozen fallback + local path registration verified'}
