def check_branding_version():
  import re
  from pathlib import Path
  
  ui_files = Path('packages/app/src').rglob('*.tsx')
  branding = False
  helper = False
  
  for f in ui_files:
    content = f.read_text()
    if re.search(r'by heidi-dang', content):
      branding = True
    if re.search(r'getDisplayVersion', content):
      helper = True
  
  if not branding:
    return _result('fail', 'No "by heidi-dang" in UI version strings')
  if not helper:
    return _result('fail', 'No getDisplayVersion helper used')
  
  return _result('pass', 'Branding version OK')