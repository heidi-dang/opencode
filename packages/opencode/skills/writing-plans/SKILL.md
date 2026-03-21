---
name: writing-plans
description: "You MUST use this after brainstorming and before any implementation - creates a detailed, bite-sized implementation plan with TDD steps and verification commands."
---

# Writing Implementation Plans

Write comprehensive implementation plans assuming the engineer has zero context and requires strict guidance. Document every action: which files to touch, specific code changes, tests, and verification commands.

## Overview

- **Bite-sized tasks**: Each step should take 2-5 minutes of work.
- **TDD first**: Plan includes writing a failing test, verifying failure, then implementation.
- **Verification evidence**: Every task ends with a verification command and expected output.
- **No vagueness**: No "add validation" - specify the exact code or logic.

## Plan Structure

### Header
```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence goal]
**Architecture:** [Brief approach]
**Tech Stack:** [Tools/libraries]
```

### Tasks
Repeat for each logical component:
```markdown
### Task N: [Component]
**Files:**
- Create: `path/to/new_file.ts`
- Modify: `path/to/existing.ts`

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Verify failure** (Command: `bun test ...`, Expected: FAIL)
- [ ] **Step 3: Implement minimal code**
- [ ] **Step 4: Verify success** (Command: `bun test ...`, Expected: PASS)
- [ ] **Step 5: Commit**
```

## Plan Review Loop
After writing the plan:
1. Dispatch `plan_reviewer` subagent with paths to spec and plan.
2. If issues found: fix and re-dispatch.
3. If approved: move to implementation.

## Key Principles
- **DRY/YAGNI**: Keep implementation minimal.
- **Isolated units**: Design for testability and clear boundaries.
- **Explicit commands**: Always provide the exact command to run.
