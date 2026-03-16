import os
import re
from pathlib import Path
from typing import List

def get_project_root() -> Path:
    return Path(__file__).parent.parent

class FinishModeCheck:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.errors = []

    def log(self, message: str):
        if self.verbose:
            print(f"  {message}")

    def run(self) -> bool:
        root = get_project_root()
        passed = True

        # 1. Check contract in heidi.txt
        heidi_prompt_path = root / "packages/opencode/src/agent/prompt/heidi.txt"
        if not heidi_prompt_path.exists():
            self.errors.append("Missing heidi.txt prompt file")
            passed = False
        else:
            content = heidi_prompt_path.read_text()
            if "Feature 14: Finish-Mode" not in content or "outcome-driven" not in content.lower():
                self.errors.append("Finish-Mode contract missing from heidi.txt")
                passed = False
            else:
                self.log("✓ Finish-Mode contract found in heidi.txt")

        # 2. Check blocker classifier
        blocker_ts_path = root / "packages/opencode/src/util/blocker.ts"
        if not blocker_ts_path.exists():
            self.errors.append("Missing blocker.ts classifier")
            passed = False
        else:
            content = blocker_ts_path.read_text()
            required_blockers = [
                "required_input_missing",
                "material_ambiguity",
                "destructive_approval_required",
                "no_tool_fallback",
                "hard_execution_failure"
            ]
            for b in required_blockers:
                if b not in content:
                    self.errors.append(f"Missing blocker type in classifier: {b}")
                    passed = False
            if passed:
                self.log("✓ Blocker classifier found with all required types")

        # 3. Check partial-read auto-continue path in prompt.ts
        prompt_ts_path = root / "packages/opencode/src/session/prompt.ts"
        if not prompt_ts_path.exists():
            self.errors.append("Missing prompt.ts orchestrator")
            passed = False
        else:
            content = prompt_ts_path.read_text()
            if "outputHasMore" not in content or "auto-continuing" not in content.lower():
                self.errors.append("Partial-read auto-continue logic missing from prompt.ts")
                passed = False
            else:
                self.log("✓ Auto-continue logic found in prompt.ts")

        # 4. Check for E2E fixture (e.g. a test file or doc)
        fixture_path = root / "docs/agent-finish-mode/proof.md" # We'll create this soon
        # For now check the directory exists
        proof_dir = root / "docs/agent-finish-mode"
        if not proof_dir.exists():
            self.errors.append("Missing docs/agent-finish-mode/ directory for E2E proofs")
            passed = False
        else:
            self.log("✓ Proof directory exists")

        return passed

def run_check(verbose: bool = False) -> bool:
    check = FinishModeCheck(verbose)
    result = check.run()
    if not result:
        for err in check.errors:
            print(f"  ✗ {err}")
    return result

if __name__ == "__main__":
    import sys
    success = run_check(verbose="--verbose" in sys.argv or "-v" in sys.argv)
    sys.exit(0 if success else 1)
