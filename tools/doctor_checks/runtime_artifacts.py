from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]


def run() -> tuple[bool, str, str]:
  name = "runtime-artifacts"
  out = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True)
  files = [line.strip() for line in out.stdout.splitlines() if line.strip()]
  bad = [
    item
    for item in files
    if item.startswith(".local/")
    or item.startswith(".opencode/heidi/")
    or "__pycache__/" in item
    or item.endswith(".pyc")
  ]

  if not bad:
    return (True, name, "no runtime artifacts detected")
  return (False, name, f"runtime artifacts present: {', '.join(sorted(bad)[:8])}")
