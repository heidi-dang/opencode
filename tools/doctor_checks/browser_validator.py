import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

def run() -> tuple[bool, str, str]:
  name = "Browser Validator Check"
  
  # Check if browser_subagent.ts uses playwright
  tool_path = ROOT / "packages" / "opencode" / "src" / "tool" / "browser_subagent.ts"
  if not tool_path.exists():
    return False, name, f"Missing {tool_path.relative_to(ROOT)}"
    
  tool_content = tool_path.read_text()
  
  if "playwright" not in tool_content.lower():
    return False, name, "Missing playwright reference in browser_subagent.ts"
    
  if "browser_report.md" not in tool_content:
    return False, name, "Missing generation of browser_report.md in browser_subagent.ts"
    
  return True, name, "Playwright browser validator logic present"

if __name__ == "__main__":
  ok, name, note = run()
  print(f"{'PASS' if ok else 'FAIL'} {name}: {note}")
