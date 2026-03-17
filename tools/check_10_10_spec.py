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

    # 1. Check Master Implementation Doc
    master_doc = root / ".local/implementation-heidi-10-10-human-like-agent-system.md"
    if not master_doc.exists():
        errors.append(f"Master Spec Doc not found: {master_doc}")
        passed = False
    else:
        log(f"Found Master Spec: {master_doc}")
        content = master_doc.read_text()
        required_keywords = [
            "Finish-Mode Runtime",
            "Task Compiler",
            "Best-Result Engine",
            "Blocker Classes",
            "success_criteria"
        ]
        for kw in required_keywords:
            if kw not in content:
                errors.append(f"Master Spec missing keyword: {kw}")
                passed = False

    # 2. Check P0: Blocker Classifier & States
    blocker_ts = root / "packages/opencode/src/util/blocker.ts"
    if not blocker_ts.exists():
        errors.append(f"blocker.ts not found: {blocker_ts}")
        passed = False
    else:
        log(f"Found blocker.ts: {blocker_ts}")
        content = blocker_ts.read_text()
        if "export const ExecutionState" not in content:
            errors.append("ExecutionState enum not found in blocker.ts")
            passed = False
        if '"required_input_missing"' not in content:
            errors.append("Blocker type 'required_input_missing' not found")
            passed = False
        if "state:" not in content:
             errors.append("Blocker Info missing 'state' field")
             passed = False

    # 3. Check P1: Expanded Task Compiler Schema
    task_ts = root / "packages/opencode/src/session/task.ts"
    if task_ts.exists():
        content = task_ts.read_text()
        expanded_fields = ["allowed_tools", "blocker_rules", "preferred_output_format"]
        for field in expanded_fields:
            if field not in content:
                errors.append(f"TaskObjectSchema missing expanded field: {field}")
                passed = False
        if passed:
            log("TaskObjectSchema contains expanded fields from Phase 1")

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
