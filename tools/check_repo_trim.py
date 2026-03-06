#!/usr/bin/env python3
import os
from pathlib import Path

def check_repo_trim() -> dict:
    name = 'repo_trim'
    
    root = Path(__file__).parent.parent
    
    enterprise_path = root / 'packages' / 'enterprise'
    if enterprise_path.exists():
        return {'name': name, 'status': 'fail', 'details': 'packages/enterprise still exists'}
    
    sst_config = root / 'sst.config.ts'
    if sst_config.exists():
        content = sst_config.read_text()
        if 'infra/enterprise.js' in content:
            return {'name': name, 'status': 'fail', 'details': 'sst.config.ts still references enterprise'}
    
    return {'name': name, 'status': 'pass', 'details': 'enterprise package removed, no references'}

if __name__ == '__main__':
    import json
    result = check_repo_trim()
    print(json.dumps(result, indent=2))
