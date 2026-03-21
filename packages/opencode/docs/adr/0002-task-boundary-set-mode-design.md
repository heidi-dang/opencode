---
title: "ADR-2: Task boundary set mode design"
status: "proposed"
date: "2026-03-21"
tags: ["architecture", "decision"]
---

# ADR 2: Task boundary set mode design

## Status
**Proposed**

## Context
## Problem

`task_boundary` still accepts `action: "set_mode"`, but the boundary now derives `mode` from `fsm_state` and throws on mismatches.

That breaks existing callers even when the requested mode matches a legal state transition like reopening planning, starting execution, or requesting verification.

## Goals

- Keep `mode` derived from `fsm_state`
- Preserve the public `set_mode` command
- Map valid mode intent onto existing transition logic
- Preserve guided errors from execution and verification paths
- Limit the change to the boundary and its tests

## Non-goals

- Redesign the FSM or mode model
- Remove or deprecate `set_mode`
- Change tool input or response shapes
- Refactor unrelated transition code

## Decision
## Design

Handle `set_mode` as a compatibility shim inside `HeidiBoundary.apply`.

Keep `state.mode` derived only through existing state transitions and never assign it from the request payload.

For `PLANNING`, treat planning states (`IDLE`, `DISCOVERY`, `PLAN_DRAFT`, `PLAN_LOCKED`, `BLOCKED`) as no-op or reopen cases based on current state.

`DISCOVERY` and `PLAN_DRAFT` stay unchanged, while `PLAN_LOCKED`, `EXECUTION`, `VERIFICATION`, `COMPLETE`, and `BLOCKED` reopen planning through the existing reopen flow and record the usual resume metadata.

For `EXECUTION`, delegate to the existing `execution(task_id)` helper.

That keeps auto-lock behavior and guided `lock_plan` errors when the implementation plan is incomplete or still unlocked.

For `VERIFICATION`, route through the existing verification path instead of comparing derived mode.

If the current state cannot legally request verification, return a guided error that names the current state and the next valid action instead of a derived-mode mismatch.

Keep the change local to `packages/opencode/src/heidi/boundary.ts`.

`packages/opencode/src/tool/task_boundary.ts` should keep forwarding `set_mode` unchanged so callers see the same API.

## Test strategy

Update `packages/opencode/test/heidi/boundary.test.ts` first and drive the fix with focused cases.

Replace the current mismatch-only expectation with compatibility coverage for each target mode.

- `set_mode: PLANNING` is a no-op from `DISCOVERY` and `PLAN_DRAFT`
- `set_mode: PLANNING` reopens from `PLAN_LOCKED`, `EXECUTION`, `VERIFICATION`, `COMPLETE`, and `BLOCKED`
- `set_mode: EXECUTION` reuses execution logic and auto-locks a complete plan
- `set_mode: EXECUTION` preserves guided incomplete-plan errors
- `set_mode: VERIFICATION` succeeds from legal execution state
- `set_mode: VERIFICATION` returns a guided error from illegal states
- Tool-level `task_boundary` coverage still works through `set_mode`

Favor narrow assertions on `fsm_state`, `mode`, lock flags, and error text.

## Verification

Run from `packages/opencode`.

```sh
bun test test/heidi/boundary.test.ts
bun typecheck
```

## Consequences
### Positive
- **POS-001**: Preserves the public API while keeping mode derived from FSM state
- **POS-002**: Reuses existing execution and verification paths instead of adding parallel logic
- **POS-003**: Improves compatibility for older callers that still send `set_mode`

### Negative
- **NEG-001**: Adds a small compatibility branch inside boundary handling
- **NEG-002**: Reopen semantics must stay aligned with explicit `reopen_plan` behavior
- **NEG-003**: Verification errors need careful wording to stay guided and consistent

## Alternatives Considered


## Implementation Notes
- **IMP-001**: Current implementation is in `packages/opencode/src/heidi/boundary.ts` and `packages/opencode/src/tool/task_boundary.ts`.
- **IMP-002**: Current tests are in `packages/opencode/test/heidi/boundary.test.ts`.
- **IMP-003**: Desired minimal behavior is limited to `set_mode` compatibility and should avoid a broad refactor.

## References
- **REF-001**: Requested target path: `docs/specs/2026-03-21-task-boundary-set-mode-design.md`
- **REF-002**: Observed bug: `set_mode is invalid; mode is derived from fsm_state EXECUTION`
