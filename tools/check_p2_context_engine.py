import os
import sys
from pathlib import Path

def get_project_root() -> Path:
    return Path(__file__).parent.parent

def run_check(verbose: bool = False) -> bool:
    root = get_project_root()
    passed = True
    errors = []

    def log(msg: str):
        if verbose:
            print(f"  {msg}")

    # 1. Check WorkingSet manager
    working_set_ts = root / "packages/opencode/src/agent/intelligence/working-set.ts"
    if not working_set_ts.exists():
        errors.append(f"WorkingSet manager not found: {working_set_ts}")
        passed = False
    else:
        log(f"Found WorkingSet: {working_set_ts}")
        content = working_set_ts.read_text()
        if "export class WorkingSet" not in content:
            errors.append("WorkingSet class not found in working-set.ts")
            passed = False
        if "static async add(" not in content:
            errors.append("WorkingSet.add method not found in working-set.ts")
            passed = False
        if "static async addNote(" not in content:
            errors.append("WorkingSet.addNote method not found in working-set.ts")
            passed = False

    # 2. Check RepoMap
    repomap_ts = root / "packages/opencode/src/agent/intelligence/repomap.ts"
    if not repomap_ts.exists():
        errors.append(f"RepoMap not found: {repomap_ts}")
        passed = False
    else:
        log(f"Found RepoMap: {repomap_ts}")
        content = repomap_ts.read_text()
        if "export class RepoMap" not in content:
            errors.append("RepoMap class not found in repomap.ts")
            passed = False

    # 3. Check SystemPrompt Integration
    system_ts = root / "packages/opencode/src/session/system.ts"
    if not system_ts.exists():
        errors.append(f"system.ts not found: {system_ts}")
        passed = False
    else:
        log(f"Found system.ts: {system_ts}")
        content = system_ts.read_text()
        if "WorkingSet.format" not in content:
            errors.append("WorkingSet.format not integrated in system.ts")
            passed = False
        if "RepoMap.generate" not in content:
            errors.append("RepoMap.generate not integrated in system.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
