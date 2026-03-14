# Infinity Loop - Self-Auditing Workflow

## Purpose

The Infinity Loop is a continuous self-auditing system for the opencode repository. It systematically processes each function/module in the codebase, identifying bugs, performance issues, and code health problems, then applies focused patches, verifies them, documents the changes, and commits them. The loop continues until the entire repository has been audited.

## States

The loop implements a strict state machine with the following states:

| State      | Description                          | Transitions                        |
| ---------- | ------------------------------------ | ---------------------------------- |
| `idle`     | Initial state, waiting to start      | → `suggest`                        |
| `suggest`  | Analyze code and suggest next target | → `select`                         |
| `select`   | Select next target from inventory    | → `inspect`                        |
| `inspect`  | Analyze current target's behavior    | → `patch` or `next` or `failed`    |
| `patch`    | Apply focused fix to target          | → `verify`                         |
| `verify`   | Run verification tests/checks        | → `document` or `next` or `failed` |
| `document` | Write evidence report (proof file)   | → `commit`                         |
| `commit`   | Commit changes with clear message    | → `next`                           |
| `next`     | Move to next target in inventory     | → `select` or `complete`           |
| `blocked`  | Target blocked due to dependencies   | → `select`                         |
| `failed`   | Target failed after max retries      | → `select`                         |
| `complete` | All targets processed                | → `idle`                           |

## Inputs

- **Target Inventory**: Canonical list of functions/modules to audit (built at start)
- **Loop State**: Current state, target, cycle id, attempt count
- **Stop Flag**: Manual stop request file (`.local/infinity-loop/stop`)
- **Resume State**: Previously persisted state for resume support

## Outputs

- **Proof Files**: Per-target documentation in `docs/infinity-loop/` with naming `proof-{target}-{timestamp}.md`
- **Commits**: One commit per completed target with clear message naming the audited function/module
- **Loop State File**: JSON file at `.local/infinity-loop/state.json` with current progress
- **Inventory File**: JSON file at `.local/infinity-loop/inventory.json` with all targets and their status

## Resume Behavior

- On startup, check for existing state file at `.local/infinity-loop/state.json`
- If exists, load and resume from current state
- If not, start fresh from `idle` state
- Resume loads: current state, target, cycle_id, attempt_count, last_result, next_action, artifact paths
- Resume does NOT redo completed targets

## Failure Handling

- Max retries per target: 3 (configurable)
- On failure: record reason, move to `failed` state, continue with next target
- On verification failure: do NOT mutate blindly, move to `blocked` or `failed`
- Failures are capped and recorded in inventory

## Evidence Files

All detailed evidence is stored in:

- `.local/infinity-loop/logs/` - detailed execution logs
- `.local/infinity-loop/state.json` - current state snapshot
- `.local/infinity-loop/inventory.json` - target inventory with statuses
- `docs/infinity-loop/proof-*.md` - per-target proof files

## Stop Conditions

- **Manual Stop**: Create file `.local/infinity-loop/stop` to halt cleanly
- **Completion**: All targets in inventory are `completed`, `blocked`, or `failed`
- **No Targets**: Inventory is empty

## State Schema

```json
{
  "version": "1.0",
  "state": "select|inspect|patch|verify|document|commit|next|blocked|failed|complete|idle",
  "current_target": "string|null",
  "cycle_id": "integer",
  "attempt_count": "integer",
  "last_result": "string|null",
  "next_action": "string|null",
  "artifact_paths": {
    "state_file": "string",
    "inventory_file": "string",
    "logs_dir": "string",
    "proofs_dir": "string"
  },
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

## Target Inventory Schema

```json
{
  "version": "1.0",
  "targets": [
    {
      "id": "string (unique)",
      "name": "string (function/module name)",
      "path": "string (file path)",
      "type": "function|module|class",
      "status": "pending|in_progress|completed|blocked|failed",
      "attempts": "integer",
      "last_error": "string|null",
      "proof_file": "string|null",
      "commit_hash": "string|null"
    }
  ],
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

## Implementation Notes

- The loop is implemented as a Python script in `tools/infinity-loop.py`
- State machine transitions are deterministic and logged
- Detailed logs are kept in artifacts, not in chat output
- Each target gets one commit (or tightly related micro-batch)
- Resume is automatic on startup if state file exists
- Manual stop is checked between cycles
