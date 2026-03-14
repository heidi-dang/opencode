# Infinity Loop Runtime V1 - Implementation Document

## Overview

The Infinity Loop Runtime is a deterministic loop runner that executes the feedback loop workflow: **suggester → planner → dev → havoc → reporter → librarian → rearm**.

## State Machine

### Stage Order

1. **suggester** - Invokes suggester agent to propose 2-3 candidate tasks
2. **planner** - Reads queue, dedupes, picks next eligible task, creates run plan
3. **dev** - Executes the selected task scope
4. **havoc** - Runs adversarial/chaos validation
5. **reporter** - Runs deterministic gates, produces gate result
6. **librarian** - Writes knowledge only for passing runs
7. **rearm** - Marks consumed queue item complete, triggers next cycle

### Master Escalation

- **master** is only invoked for structured stuck packets from dev
- Returns ranked diagnosis + next actions
- Does NOT merge, complete tasks, or mutate queue

### Oracle

- Read-only helper for codebase context
- Consulted by planner before writing plans

## Files

### Runtime Files

- `.opencode/queue.json` - Task queue array
- `.opencode/runs/<run-id>/` - Run directories
- `.opencode/runs/<run-id>/state.json` - Run state
- `.opencode/runs/<run-id>/plan.json` - Execution plan
- `.opencode/runs/<run-id>/events.jsonl` - Event log
- `.opencode/runs/<run-id>/notes/` - Librarian notes
- `.opencode/knowledge/` - Permanent knowledge storage
- `.opencode/infinity.lock` - Lock file

### Schemas

- `.opencode/schemas/task.schema.json`
- `.opencode/schemas/run-state.schema.json`
- `.opencode/schemas/gate.schema.json`
- `.opencode/schemas/stuck.schema.json`

## Resume Behavior

1. On startup, runtime checks for runs in non-terminal state
2. Non-terminal states: planning, assigned, in_progress, stuck, ready_for_reporter, gating
3. Resumes from the saved stage instead of spawning a new run
4. Terminal states: passed, failed, rolled_back

## Failure Handling

### Missing Queue File

- Bootstrap creates empty `[]` if missing

### Invalid Schema Payload

- `validateQueue()` rejects malformed items loudly with descriptive errors

### Empty Queue After Suggester

- Suggester advances to rearm if no tasks generated

### Dev Timeout/No-Output Stall

- Dev emits stuck packet after attempt threshold
- Planner tries to resolve or escalates to master

### Havoc Reject

- Returns to dev with crash report

### Reporter Retry

- Can return retry_with_actions

### Master Escalation Loop

- Master returns ranked diagnosis
- Planner incorporates into revised plan

### Process Crash Mid-Run

- Resume checks for non-terminal state on restart

### Stale Lock File

- Checks if PID is alive; removes if dead

## Loop Controller

### Options

- `--max-cycles`: Maximum cycles (default: 1)
- `--max-retries`: Maximum retries per task (default: 2)
- `--idle-backoff`: Idle backoff in ms (default: 5000)
- `--daemon`: Run continuously
- `--watch`: Watch mode

### Lock File

- Prevents concurrent loop instances
- Contains PID and start time
- Validates process is alive before refusing

## Structured Logs

Every transition logs:

- timestamp (ISO-8601)
- run_id
- task_id
- stage_from
- stage_to
- result

Logs written to `.opencode/infinity.log`

## CLI Usage

```bash
# Start one cycle
opencode infinity start

# Start with custom settings
opencode infinity start --max-cycles 5 --daemon

# Check status
opencode infinity status

# Run doctor check
python tools/doctor.py -c infinity-loop
```
