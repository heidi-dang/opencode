#!/bin/bash
set -e

echo "=> Adding upstream remote if not exists..."
git remote get-url upstream || git remote add upstream https://github.com/anomalyco/opencode.git

echo "=> Fetching upstream tag v1.14.33..."
git fetch upstream tag v1.14.33

echo "=> Checking out branch heidi/upstream-1.14.33-sync..."
git checkout -B heidi/upstream-1.14.33-sync main

echo "=> Merging v1.14.33 (expecting conflicts in session/compaction)..."
# We turn off -e because merge will fail with exit code 1 on conflict
set +e
git merge v1.14.33 --no-commit
MERGE_STATUS=$?

if [ $MERGE_STATUS -ne 0 ]; then
  echo ""
  echo "⚠️ MERGE CONFLICTS DETECTED ⚠️"
  echo "The upstream sync encountered conflicts, specifically in packages/opencode/src/session/ and packages/ui/."
  echo "Please resolve the conflicts manually to preserve the 'Heidi' FSM and compaction changes while adopting the new upstream Effect-based architecture."
  echo ""
  echo "Once resolved, run:"
  echo "  git commit -m \"chore: sync with upstream v1.14.33\""
  echo "Then continue to the next phase."
  exit 1
else
  echo "✅ Merge completed cleanly."
  git commit -m "chore: sync with upstream v1.14.33"
fi
