#!/usr/bin/env python3
import re
import sys
import json
from pathlib import Path

def _result(name: str, status: str, details: str = '') -> dict:
    return {'name': name, 'status': status, 'details': details}

def check_ui_glow_polish() -> dict:
    name = 'ui_glow_polish'
    print('Running UI glow polish gate', file=sys.stderr)

    root = Path(__file__).parent.parent

    # Spec doc
    spec_doc = root / 'packages/docs/implementation-ui_glow_polish.md'
    if not spec_doc.exists():
        return _result(name, 'fail', f'Spec doc missing: {spec_doc}')

    # CSS tokens in aurora.css
    aurora_css = root / 'packages/ui/src/styles/aurora.css'
    if not aurora_css.exists():
        return _result(name, 'fail', f'aurora.css missing: {aurora_css}')

    content = aurora_css.read_text()
    classes = ['aurora-bg', 'glow-border', 'glow-active', 'glow-focus']
    missing_classes = []
    for c in classes:
        if not re.search(rf'\.{re.escape(c)}\b|--glow-{re.escape(c)}\b', content):
            missing_classes.append(c)
    if missing_classes:
        return _result(name, 'fail', f'Missing CSS: {missing_classes}')

    # aurora-bg in layout.tsx
    layout = root / 'packages/app/src/pages/layout.tsx'
    if layout.exists():
        layout_content = layout.read_text()
        if not re.search(r'class=["\'][^"\']*aurora-bg', layout_content):
            return _result(name, 'fail', 'aurora-bg class token missing from layout.tsx')

    # prefers-reduced-motion
    if not re.search(r'@media\s+\(prefers-reduced-motion\s*:', content, re.IGNORECASE):
        return _result(name, 'fail', 'Reduced motion media query missing')

    print('UI glow polish check passed', file=sys.stderr)
    return _result(name, 'pass', f'{len(classes)} classes + spec + reduced-motion OK')

if __name__ == '__main__':
    result = check_ui_glow_polish()
    print(json.dumps({'timestamp': 'standalone', 'results': [result]}))
