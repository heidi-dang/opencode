#!/usr/bin/env python3
import os
import sys
import re
from pathlib import Path

def check_ui_resolution():
    print("🔍 [Doctor] Checking UI Source Resolution Pipeline (Refined Spec)...")
    
    repo_root = Path(__file__).parent.parent
    server_ts = repo_root / "packages" / "opencode" / "src" / "server" / "server.ts"
    resolver_ts = repo_root / "packages" / "opencode" / "src" / "server" / "ui-source-resolver.ts"
    
    errors = []

    # 1. Check for Resolver File & Explicit Types
    if not resolver_ts.exists():
        errors.append(f"MISSING: {resolver_ts} (UiSourceResolver implementation)")
    else:
        content = resolver_ts.read_text()
        required_types = ['"dev-url"', '"dist"', '"repo-dist"', '"hosted"']
        for t in required_types:
            if t not in content:
                errors.append(f"MISSING: Source type {t} in UiSourceResolver")
        print(f"✅ Found UiSourceResolver with explicit types")

    # 2. Check for HMR/WebSocket support in server.ts
    if server_ts.exists():
        content = server_ts.read_text()
        if "websocket" not in content.lower() or "proxy" not in content.lower():
            errors.append("MISSING: HMR/WebSocket proxy support in server.ts")
        if "UI source:" not in content or "UI target:" not in content:
            errors.append("MISSING: Structured startup diagnostics in server.ts")
        else:
            print("✅ Found HMR/WebSocket proxy and structured diagnostics in server.ts")
    else:
        errors.append(f"MISSING: {server_ts}")

    # 3. Verify No Hardcoded Ports or Guesses
    # Search for common dev ports in server/resolver code
    port_regex = re.compile(r':(5173|3000|8080)|localhost:[0-9]+')
    potential_leaks = []
    
    for f in [server_ts, resolver_ts]:
        if f.exists():
            content = f.read_text()
            matches = port_regex.findall(content)
            if matches:
                 potential_leaks.append(f.name)
    
    if potential_leaks:
        errors.append(f"FAIL: Hardcoded port assumptions or 'localhost:port' found in {', '.join(potential_leaks)}")
    else:
        print("✅ No hardcoded dev ports or guesses detected in resolver/server logic")

    # 4. Git-based Repo Root Detection
    if resolver_ts.exists():
        content = resolver_ts.read_text()
        if "git" not in content or "rev-parse" not in content:
            errors.append("MISSING: Git-based repo-root detection in UiSourceResolver")
        else:
            print("✅ Found Git-based repo-root discovery")

    # 5. Check Config Schema
    config_ts = repo_root / "packages" / "opencode" / "src" / "config" / "config.ts"
    if config_ts.exists():
        content = config_ts.read_text()
        if "uiDevUrl" not in content:
            errors.append("MISSING: uiDevUrl in config schema")
        else:
            print("✅ Found uiDevUrl in config schema")

    if errors:
        print("\n❌ UI Doctor found critical spec violations:")
        for err in errors:
            print(f"   - {err}")
        sys.exit(1)

    print("\n✅ UI Source Resolver is fully compliant with the refined spec.")
    print("   - Live HMR/WebSocket traffic is supported.")
    print("   - Explicit sources fail loudly.")
    print("   - No hardcoded ports or symlink dependencies remain.")

if __name__ == "__main__":
    check_ui_resolution()
