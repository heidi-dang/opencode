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

    # 1. Check Specialist Router Module
    router_ts = root / "packages/opencode/src/agent/intelligence/router.ts"
    if not router_ts.exists():
        errors.append(f"SpecialistRouter module not found: {router_ts}")
        passed = False
    else:
        log(f"Found SpecialistRouter: {router_ts}")
        content = router_ts.read_text()
        if "export class SpecialistRouter" not in content:
            errors.append("SpecialistRouter class not found in router.ts")
            passed = False
        if "static route(" not in content:
            errors.append("SpecialistRouter.route method not found in router.ts")
            passed = False
        
        required_lanes = ["frontend", "backend", "systems", "fullstack"]
        for lane in required_lanes:
            if f'"{lane}"' not in content and f"'{lane}'" not in content:
                errors.append(f"Lane '{lane}' not defined in SpecialistRouter")
                passed = False

    # 2. Check SystemPrompt Integration
    system_ts = root / "packages/opencode/src/session/system.ts"
    if not system_ts.exists():
        errors.append(f"system.ts not found: {system_ts}")
        passed = False
    else:
        log(f"Found system.ts: {system_ts}")
        content = system_ts.read_text()
        if "SpecialistRouter.route" not in content:
            errors.append("SpecialistRouter.route not integrated in system.ts")
            passed = False
        if "export function router(" not in content:
            errors.append("SystemPrompt.router function not found in system.ts")
            passed = False

    # 3. Check Prompt Processor Integration
    prompt_ts = root / "packages/opencode/src/session/prompt.ts"
    if not prompt_ts.exists():
        errors.append(f"prompt.ts not found: {prompt_ts}")
        passed = False
    else:
        log(f"Found prompt.ts: {prompt_ts}")
        content = prompt_ts.read_text()
        if "SystemPrompt.router(taskObject, patterns)" not in content:
            errors.append("SystemPrompt.router not called in prompt.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
