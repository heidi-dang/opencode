---
name: finishing-a-development-branch
description: "Use when implementation is complete, all tests pass, and you need to integrate the work (Merge, PR, or Cleanup)."
---

# Finishing a Development Branch

Complete the development cycle by verifying the final state and integrating changes.

## The Process

1. **Final Verification**: Run the full project test suite. If it fails, FIX IT before proceeding.
2. **Check Base Branch**: Identify the target branch (usually `main` or `dev`).
3. **Present Options**:
   - 1. Merge locally
   - 2. Push and Create PR
   - 3. Keep as-is (branch preserved)
   - 4. Discard work (confirm first)
4. **Execute Choice**: Perform the requested git operations.
5. **Cleanup**: Remove temporary worktrees if the work is merged or discarded.

## Red Flags
- Proceeding with failing tests.
- Merging without a final smoke test.
- Deleting work without explicit user confirmation.
