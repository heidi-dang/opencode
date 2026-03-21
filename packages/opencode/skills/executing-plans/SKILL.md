---
name: executing-plans
description: "Use when you have a written implementation plan to execute in this session with review checkpoints."
---

# Executing Plans

Execute the current plan step-by-step with continuous verification.

## The Process

1. **Load/Review Plan**: Mark high-level tasks in `task.md`.
2. **Execute Tasks**:
   - Follow every step exactly (TDD, implementation, verification).
   - Use `verification-before-completion` skill after each task.
3. **Commit Frequently**: After every successful step or small task.
4. **Handoff for Review**: After a major phase, notify the user or dispatch a reviewer.

## When to Stop
- Hit a blocker or missing dependency.
- Plan logic is flawed or incomplete.
- Verification fails repeatedly.

**Do not guess. Ask for clarification or update the plan.**
