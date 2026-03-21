---
name: subagent-driven-development
description: "Execute plan by dispatching fresh subagent per task, with two-stage review after each: spec compliance review first, then code quality review."
---

# Subagent-Driven Development (SDD)

Execute implementation plans by delegating tasks to specialized sub-agents.

## Core Principle
**Fresh subagent per task + Two-stage review (Spec then Quality) = High quality, fast iteration.**

## The Process
For each task in the plan:

1. **Dispatch Implementer**: Use a fresh subagent with the exact task text and minimal required context.
2. **Handle Questions**: Answer any clarifying questions from the implementer before they begin.
3. **Wait for Completion**: Implementer should implement, test, and commit.
4. **Spec Compliance Review**: Dispatch a `spec_reviewer` subagent.
   - If ❌: Fix with implementer, re-review.
5. **Code Quality Review**: Dispatch a `code_quality_reviewer` subagent.
   - If ❌: Fix with implementer, re-review.
6. **Mark Complete**: Only once both reviews are ✅.

## Handing Implementer Status
- **DONE**: Proceed to review.
- **NEEDS_CONTEXT**: Provide information and re-dispatch.
- **BLOCKED**: Assess if task is too large, plan is wrong, or needs better model.

## Red Flags
- Skipping reviews or the red-green-refactor loop.
- Ignoring subagent concerns or questions.
- Proceeding to next task before current one is fully reviewed and approved.
