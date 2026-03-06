#!/usr/bin/env bash
set -euo pipefail

REPO=~/work/opencode-heidi-main
PLUGIN=~/.config/opencode/plugins/oh-my-opencode
INSTALLED_BIN="$(readlink -f "$(command -v opencode)")"
LOCAL_BIN="$(find "$REPO/packages/opencode/dist" -type f -path '*/bin/opencode' | head -n1)"

echo "=== opencode ==="
echo "repo branch: $(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
echo "repo commit: $(git -C "$REPO" rev-parse HEAD)"
echo "installed:   $INSTALLED_BIN"
echo "local:       $LOCAL_BIN"
cmp -s "$INSTALLED_BIN" "$LOCAL_BIN" && echo "binary: OK local build" || echo "binary: BAD mismatch"

echo
echo "=== plugin ==="
python3 - <<'PY'
import json, os
p=os.path.expanduser("~/.config/opencode/opencode.json")
d=json.load(open(p))
print("config plugins:", d.get("plugin", []))
PY
git -C "$PLUGIN" fetch origin main -q
echo "plugin HEAD:  $(git -C "$PLUGIN" rev-parse HEAD)"
echo "origin/main:  $(git -C "$PLUGIN" rev-parse origin/main)"
test "$(git -C "$PLUGIN" rev-parse HEAD)" = "$(git -C "$PLUGIN" rev-parse origin/main)" && echo "plugin: OK latest main" || echo "plugin: BAD not latest"
echo "build cache:  $(cat "$PLUGIN/.opencode-build" 2>/dev/null || echo missing)"
