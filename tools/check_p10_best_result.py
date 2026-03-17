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

    # 1. Check BestResultEngine Module
    best_ts = root / "packages/opencode/src/agent/intelligence/best-result.ts"
    if not best_ts.exists():
        errors.append(f"BestResultEngine module not found: {best_ts}")
        passed = False
    else:
        log(f"Found BestResultEngine: {best_ts}")
        content = best_ts.read_text()
        if "export class BestResultEngine" not in content:
            errors.append("BestResultEngine class not found in best-result.ts")
            passed = False
        if "static getPolicy(" not in content:
            errors.append("BestResultEngine.getPolicy method not found in best-result.ts")
            passed = False
        
        required_features = ["Excellence Standard", "Dissatisfaction Signal", "Bounded Stop", "Rubric"]
        for feature in required_features:
            if feature not in content:
                errors.append(f"Feature '{feature}' not defined in BestResultEngine")
                passed = False

    # 2. Check SystemPrompt Integration
    system_ts = root / "packages/opencode/src/session/system.ts"
    if not system_ts.exists():
        errors.append(f"system.ts not found: {system_ts}")
        passed = False
    else:
        log(f"Found system.ts: {system_ts}")
        content = system_ts.read_text()
        if "BestResultEngine.getPolicy" not in content:
            errors.append("BestResultEngine.getPolicy not integrated in system.ts")
            passed = False
        if "export function quality(" not in content:
            errors.append("SystemPrompt.quality function not found in system.ts")
            passed = False

    # 3. Check Prompt Processor Integration
    prompt_ts = root / "packages/opencode/src/session/prompt.ts"
    if not prompt_ts.exists():
        errors.append(f"prompt.ts not found: {prompt_ts}")
        passed = False
    else:
        log(f"Found prompt.ts: {prompt_ts}")
        content = prompt_ts.read_text()
        if "SystemPrompt.quality()" not in content:
            errors.append("SystemPrompt.quality() not called in prompt.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
