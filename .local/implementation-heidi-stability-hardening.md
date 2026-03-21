# Heidi Stability Hardening

## Rollback Proof

Heidi rollback proof remains rooted in the existing checkpoint flow in `packages/opencode/src/heidi/exec.ts`.

- `HeidiExec.checkpoint` captures a hidden Git ref at `refs/heidi/checkpoints/<session>/<id>` when the worktree is Git-backed.
- If Git checkpointing is unavailable, the fallback snapshot stores file existence and content in `.opencode/heidi/checkpoints/<id>.json`.
- `HeidiExec.cmd` already rolls back on non-zero exit when a checkpoint is active.
- `HeidiExec.rollback` restores the hidden ref or the JSON snapshot and refreshes tracked file times.

This PR does not change rollback mechanics. It documents that the memory hardening work relies on the same checkpoint and rollback path already used by Heidi command execution.

## Timeout Design

Subagent timeout handling is implemented in `packages/opencode/src/tool/task.ts`.

- A guard timeout races the prompt and iteration watcher.
- On timeout, Heidi records the event through `HeidiHealth.timeout()`.
- The child session is cancelled via `SessionPrompt.cancel(session.id)`.
- The task result is marked with `status: "timeout"`, `reason: "subagent_timeout"`, and `guard.triggered: "timeout"`.

The doctor for this PR verifies that the timeout hook still exists because the health payload depends on it.

## Conflict Model

Exclusive edit conflicts are handled in `packages/opencode/src/tool/task.ts` before a subagent starts.

- Owned files are normalized into an `owned` list.
- `acquireLocks` returns conflicting files when another task already owns them.
- Heidi records conflicts through `HeidiHealth.conflict()`.
- The task returns `status: "conflict"` with `reason: "ownership_conflict"` and the conflicting file list.

This keeps the conflict model lightweight and explicit. No new persistence layer is introduced in this PR.

## Health Payload

The global health route in `packages/opencode/src/server/routes/global.ts` returns a Heidi payload alongside server health data.

- Response shape: `{ healthy, version, heidi }`
- `heidi` is validated with `HeidiHealthSummary`
- `heidi` currently includes checkpoint counts, rollback counts, command failure counts, active subagents, last timeout time, last conflict time, and last rollback time

The doctor asserts that the route still exposes the Heidi payload and schema wiring.

## Limitations

- Memory trust remains heuristic. The regex groups are intentionally simple and will not catch every secret format.
- Unknown content is allowed to persist so Heidi can keep lightweight memory behavior without blocking on every opaque string.
- The new doctor is static. It verifies code presence and file coverage, not runtime behavior.
- Git checkpointing still depends on repository state and hidden refs; the fallback JSON snapshot remains the non-Git safety path.