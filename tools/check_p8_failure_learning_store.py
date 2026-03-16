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

    # 1. Check FailureStore Module
    store_ts = root / "packages/opencode/src/agent/intelligence/failure-store.ts"
    if not store_ts.exists():
        errors.append(f"FailureStore module not found: {store_ts}")
        passed = False
    else:
        log(f"Found FailureStore: {store_ts}")
        content = store_ts.read_text()
        if "export class FailureStore" not in content:
            errors.append("FailureStore class not found in failure-store.ts")
            passed = False
        if "static getPolicy(" not in content:
            errors.append("FailureStore.getPolicy method not found in failure-store.ts")
            passed = False
        
        required_features = ["Failure Journal", "Heuristics Feedback", "Anti-Pattern Detection", ".opencode/intelligence/failure_journal.jsonl"]
        for feature in required_features:
            if feature not in content:
                errors.append(f"Feature/Path '{feature}' not defined in FailureStore")
                passed = False

    # 2. Check SystemPrompt Integration
    system_ts = root / "packages/opencode/src/session/system.ts"
    if not system_ts.exists():
        errors.append(f"system.ts not found: {system_ts}")
        passed = False
    else:
        log(f"Found system.ts: {system_ts}")
        content = system_ts.read_text()
        if "FailureStore.getPolicy" not in content:
            errors.append("FailureStore.getPolicy not integrated in system.ts")
            passed = False
        if "export function learning(" not in content:
            errors.append("SystemPrompt.learning function not found in system.ts")
            passed = False

    # 3. Check Prompt Processor Integration
    prompt_ts = root / "packages/opencode/src/session/prompt.ts"
    if not prompt_ts.exists():
        errors.append(f"prompt.ts not found: {prompt_ts}")
        passed = False
    else:
        log(f"Found prompt.ts: {prompt_ts}")
        content = prompt_ts.read_text()
        if "SystemPrompt.learning()" not in content:
            errors.append("SystemPrompt.learning() not called in prompt.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
