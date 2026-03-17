import os
import re
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

    # 1. Check TaskCompiler implementation
    task_ts = root / "packages/opencode/src/session/task.ts"
    if not task_ts.exists():
        errors.append(f"TaskCompiler file not found: {task_ts}")
        passed = False
    else:
        log(f"Found TaskCompiler: {task_ts}")
        content = task_ts.read_text()
        if "export const TaskObjectSchema" not in content:
            errors.append("TaskObjectSchema not found in task.ts")
            passed = False
        if "export namespace TaskCompiler" not in content:
            errors.append("TaskCompiler namespace not found in task.ts")
            passed = False
        if "export async function compile" not in content:
            errors.append("TaskCompiler.compile not found in task.ts")
            passed = False

    # 2. Check Integration in prompt.ts
    prompt_ts = root / "packages/opencode/src/session/prompt.ts"
    if not prompt_ts.exists():
        errors.append(f"prompt.ts not found: {prompt_ts}")
        passed = False
    else:
        log(f"Found prompt.ts: {prompt_ts}")
        content = prompt_ts.read_text()
        if "TaskCompiler.compile" not in content:
            errors.append("TaskCompiler.compile not integrated in prompt.ts")
            passed = False
        if "task:" in content and "TaskCompiler.compile" in content:
            log("TaskCompiler integrated into prompt logic")

    # 3. Check Persistence in message-v2.ts (TaskPart)
    message_v2_ts = root / "packages/opencode/src/session/message-v2.ts"
    if not message_v2_ts.exists():
        errors.append(f"message-v2.ts not found: {message_v2_ts}")
        passed = False
    else:
        log(f"Found message-v2.ts: {message_v2_ts}")
        content = message_v2_ts.read_text()
        if "export const TaskPart" in content and "type: z.literal(\"task_object\")" in content:
            log("TaskPart persistence structure found in message-v2.ts")
        else:
            errors.append("TaskPart structure not found in message-v2.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    import sys
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
