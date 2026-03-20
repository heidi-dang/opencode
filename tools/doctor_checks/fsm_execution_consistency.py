from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = ROOT / "packages" / "opencode" / "src" / "tool"


def run() -> tuple[bool, str, str]:
  name = "fsm-execution-consistency"
  checked_files = [
    "edit.ts",
    "write.ts",
    "replace_file_content.ts",
    "apply_patch.ts",
  ]

  missing = []
  for filename in checked_files:
    path = TOOLS_DIR / filename
    if not path.exists():
      continue
    
    content = path.read_text()
    if "HeidiState.assertExecution" not in content:
      missing.append(filename)

  if missing:
    return (False, name, f"tools missing FSM preflight check (HeidiState.assertExecution): {', '.join(missing)}")

  # Also check if boundary.ts has the correct StateMode derivation
  boundary_path = ROOT / "packages" / "opencode" / "src" / "heidi" / "boundary.ts"
  if boundary_path.exists():
    boundary_content = boundary_path.read_text()
    if "state.mode = StateMode[next]" not in boundary_content:
      return (False, name, "boundary.ts: mode is not derived from FsmState in move()")

  return (True, name, "all tools gated and FSM derivation consistent")
