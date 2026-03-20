#!/usr/bin/env python3

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
  sys.path.insert(0, str(ROOT))

from doctor_checks.thinking_card_mobile_polish import run as run_thinking_card_mobile_polish
from doctor_checks.live_activity_chips import run as run_live_activity_chips
from doctor_checks.live_usage_stats import run as run_live_usage_stats
from doctor_checks.runtime_artifacts import run as run_runtime_artifacts
from doctor_checks.fsm_execution_consistency import run as run_fsm_execution_consistency


def main() -> int:
  checks = [
    run_thinking_card_mobile_polish(),
    run_live_activity_chips(),
    run_live_usage_stats(),
    run_runtime_artifacts(),
    run_fsm_execution_consistency(),
  ]
  ok = all(item[0] for item in checks)

  for passed, name, note in checks:
    state = "PASS" if passed else "FAIL"
    print(f"[{state}] {name}: {note}")

  if ok:
    print("\nDoctor checks passed.")
    return 0

  print("\nDoctor checks failed.")
  return 1


if __name__ == "__main__":
  raise SystemExit(main())
