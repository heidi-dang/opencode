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

    # 1. Check RecoveryEngine Module
    recovery_ts = root / "packages/opencode/src/agent/intelligence/recovery.ts"
    if not recovery_ts.exists():
        errors.append(f"RecoveryEngine module not found: {recovery_ts}")
        passed = False
    else:
        log(f"Found RecoveryEngine: {recovery_ts}")
        content = recovery_ts.read_text()
        if "export class RecoveryEngine" not in content:
            errors.append("RecoveryEngine class not found in recovery.ts")
            passed = False
        if "static getPolicy(" not in content:
            errors.append("RecoveryEngine.getPolicy method not found in recovery.ts")
            passed = False
        
        required_strategies = ["lint_error", "test_failure", "tool_timeout", "Rollback Rule"]
        for strategy in required_strategies:
            if strategy not in content:
                errors.append(f"Strategy/Rule '{strategy}' not defined in RecoveryEngine")
                passed = False

    # 2. Check SystemPrompt Integration
    system_ts = root / "packages/opencode/src/session/system.ts"
    if not system_ts.exists():
        errors.append(f"system.ts not found: {system_ts}")
        passed = False
    else:
        log(f"Found system.ts: {system_ts}")
        content = system_ts.read_text()
        if "RecoveryEngine.getPolicy" not in content:
            errors.append("RecoveryEngine.getPolicy not integrated in system.ts")
            passed = False
        if "export function recovery(" not in content:
            errors.append("SystemPrompt.recovery function not found in system.ts")
            passed = False

    # 3. Check Prompt Processor Integration
    prompt_ts = root / "packages/opencode/src/session/prompt.ts"
    if not prompt_ts.exists():
        errors.append(f"prompt.ts not found: {prompt_ts}")
        passed = False
    else:
        log(f"Found prompt.ts: {prompt_ts}")
        content = prompt_ts.read_text()
        if "SystemPrompt.recovery()" not in content:
            errors.append("SystemPrompt.recovery() not called in prompt.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
