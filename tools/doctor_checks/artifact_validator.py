import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

def run() -> tuple[bool, str, str]:
  name = "Artifact Validator Check"
  
  # Check if HeidiVerify.gate includes the file existence checks
  verify_path = ROOT / "packages" / "opencode" / "src" / "heidi" / "verify.ts"
  if not verify_path.exists():
    return False, name, f"Missing {verify_path.relative_to(ROOT)}"
    
  verify_content = verify_path.read_text()
  required_files = ["implementation_plan.md", "task.md", "verification.json", "diff_summary.md", "test_output.txt"]
  
  for file in required_files:
    if file not in verify_content:
      return False, name, f"Missing artifact check for {file} in verify.ts"
      
  if "browser_report.md" not in verify_content:
    return False, name, "Missing artifact check for browser_report.md in verify.ts"
    
  return True, name, "Artifact validator logic present"

if __name__ == "__main__":
  ok, name, note = run()
  print(f"{'PASS' if ok else 'FAIL'} {name}: {note}")
