from pathlib import Path
from typing import List
import re

def check_diff_theme_resolution(root: Path, verbose: bool = False) -> List[str]:
    """
    Verifies that the diff renderer theme is properly resolved.
    - Ensures packages/ui/src/pierre/index.ts uses resolveDiffTheme.
    - Ensures packages/ui/src/pierre/index.ts does not pass undefined themes to createDefaultOptions.
    """
    errors = []
    index_path = root / "packages/ui/src/pierre/index.ts"
    
    if not index_path.exists():
        errors.append(f"Missing Pierre index file: {index_path}")
        return errors

    content = index_path.read_text()
    
    # Check 1: Must import resolveDiffTheme
    if "import { resolveDiffTheme } from \"./theme\"" not in content:
        errors.append("packages/ui/src/pierre/index.ts is missing import from ./theme")

    # Check 2: Must use resolveDiffTheme in createDefaultOptions
    if "const finalTheme = resolveDiffTheme()" not in content:
        errors.append("packages/ui/src/pierre/index.ts does not call resolveDiffTheme()")

    # Check 3: Theme field must use finalTheme
    if re.search(r'theme:\s+finalTheme,', content) is None:
        errors.append("packages/ui/src/pierre/index.ts is not passing finalTheme to options")

    # Check 4: No more lazyTheme pattern (the buggy one)
    if "lazyTheme" in content:
        errors.append("packages/ui/src/pierre/index.ts still contains the legacy lazyTheme pattern")

    return errors
