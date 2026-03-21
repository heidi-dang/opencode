---
name: using-git-worktrees
description: "Use to create isolated workspaces sharing the same repository - allows work on multiple branches simultaneously without switching."
---

# Using Git Worktrees

Git worktrees provide clean, isolated workspaces for sub-agents or parallel tasks.

## The Process

1. **Check Existing**: See if a worktree already exists for this task/branch.
2. **Select Location**:
   - Primary: `.worktrees/<branch-name>`
   - Secondary: `worktrees/<branch-name>`
   - Ensure the directory is git-ignored.
3. **Create Worktree**:
   ```bash
   git worktree add <path> -b <branch-name>
   ```
4. **Setup Environment**: Run `npm install`, `bun install`, or project-specific setup in the new directory.
5. **Verify Baseline**: Run a smoke test to ensure the worktree starts in a clean, passing state.

## Cleanup
When work is complete (merged or discarded):
```bash
git worktree remove <path>
```

## Red Flags
- Creating a worktree in a non-ignored directory.
- Skipping the initial environment setup.
- Proceeding with failing tests in a fresh worktree (baseline failure).
