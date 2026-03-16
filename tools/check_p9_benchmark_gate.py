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

    # 1. Check BenchmarkGate Module
    benchmark_ts = root / "packages/opencode/src/agent/intelligence/benchmark.ts"
    if not benchmark_ts.exists():
        errors.append(f"BenchmarkGate module not found: {benchmark_ts}")
        passed = False
    else:
        log(f"Found BenchmarkGate: {benchmark_ts}")
        content = benchmark_ts.read_text()
        if "export class BenchmarkGate" not in content:
            errors.append("BenchmarkGate class not found in benchmark.ts")
            passed = False
        if "static getPolicy(" not in content:
            errors.append("BenchmarkGate.getPolicy method not found in benchmark.ts")
            passed = False
        
        required_features = ["Performance Gate", "Regression Control", "Lint Guard"]
        for feature in required_features:
            if feature not in content:
                errors.append(f"Feature '{feature}' not defined in BenchmarkGate")
                passed = False

    # 2. Check SystemPrompt Integration
    system_ts = root / "packages/opencode/src/session/system.ts"
    if not system_ts.exists():
        errors.append(f"system.ts not found: {system_ts}")
        passed = False
    else:
        log(f"Found system.ts: {system_ts}")
        content = system_ts.read_text()
        if "BenchmarkGate.getPolicy" not in content:
            errors.append("BenchmarkGate.getPolicy not integrated in system.ts")
            passed = False
        if "export function benchmark(" not in content:
            errors.append("SystemPrompt.benchmark function not found in system.ts")
            passed = False

    # 3. Check Prompt Processor Integration
    prompt_ts = root / "packages/opencode/src/session/prompt.ts"
    if not prompt_ts.exists():
        errors.append(f"prompt.ts not found: {prompt_ts}")
        passed = False
    else:
        log(f"Found prompt.ts: {prompt_ts}")
        content = prompt_ts.read_text()
        if "SystemPrompt.benchmark()" not in content:
            errors.append("SystemPrompt.benchmark() not called in prompt.ts")
            passed = False

    if not passed:
        for err in errors:
            print(f"    ✗ {err}")
    
    return passed

if __name__ == "__main__":
    success = run_check(verbose=True)
    sys.exit(0 if success else 1)
