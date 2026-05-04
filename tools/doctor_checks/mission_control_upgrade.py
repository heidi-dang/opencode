import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

def run() -> tuple[bool, str, str]:
  name = "Mission Control Upgrade Check"
  
  # 1. Check if the schema.sql.ts exists and has the additive tables
  schema_path = ROOT / "packages" / "opencode" / "src" / "heidi" / "schema.sql.ts"
  if not schema_path.exists():
    return False, name, f"Missing {schema_path.relative_to(ROOT)}"
    
  schema_content = schema_path.read_text()
  required_tables = ["task_cards", "artifact_metadata", "fsm_snapshots", "agent_runs"]
  for table in required_tables:
    if f'sqliteTable("{table}"' not in schema_content:
      return False, name, f"Missing table {table} in {schema_path.relative_to(ROOT)}"
      
  # 2. Check if the Mission Control route is added to the Solid Router
  app_tsx = ROOT / "packages" / "app" / "src" / "app.tsx"
  if not app_tsx.exists():
    return False, name, f"Missing {app_tsx.relative_to(ROOT)}"
    
  app_content = app_tsx.read_text()
  if 'path="/heidi/mission-control"' not in app_content:
    return False, name, f"Missing /heidi/mission-control route in {app_tsx.relative_to(ROOT)}"
    
  # 3. Check if the Mission Control page exists
  page_path = ROOT / "packages" / "app" / "src" / "pages" / "mission-control.tsx"
  if not page_path.exists():
    return False, name, f"Missing {page_path.relative_to(ROOT)}"
    
  return True, name, "Mission control route and schema present"

if __name__ == "__main__":
  ok, name, note = run()
  print(f"{'PASS' if ok else 'FAIL'} {name}: {note}")
