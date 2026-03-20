# Heidi Runtime Orchestration Spec

Status: Proposed
Scope: `heidi-dang/opencode` runtime integration

This spec defines Heidi as a strict orchestration layer inside the existing OpenCode runtime. It does not create a second execution system.

## 1) Objectives

Heidi must provide:

- fast, bounded repo understanding
- plan-first execution with explicit lock semantics
- transactional edits with deterministic rollback
- evidence-based verification gates
- restart/compaction-safe resume
- optional specialized subagents with isolated authority
- synchronized machine/human task state

## 2) Canonical State Machine

Internal FSM (runtime-enforced):

`IDLE -> DISCOVERY -> PLAN_DRAFT -> PLAN_LOCKED -> EXECUTION -> VERIFICATION -> COMPLETE`

Allowed regressions only:

- `PLAN_LOCKED -> DISCOVERY` (plan explicitly reopened)
- `EXECUTION -> PLAN_DRAFT` (hard contradiction or missing dependency)
- `VERIFICATION -> EXECUTION` (direct remediation only)
- `ANY -> BLOCKED` (unsafe or non-deterministic progression)

### 2.1 State Transition Table

| From         | To           | Trigger                              | Guard                         | Runtime action                         |
| ------------ | ------------ | ------------------------------------ | ----------------------------- | -------------------------------------- |
| IDLE         | DISCOVERY    | `task_boundary.start`                | objective present             | initialize task artifacts              |
| DISCOVERY    | PLAN_DRAFT   | budget exhausted or explicit draft   | discovery ledger valid        | create/update `implementation_plan.md` |
| PLAN_DRAFT   | PLAN_LOCKED  | `task_boundary.lock_plan`            | plan completeness checks pass | pin plan hash and lock objective       |
| PLAN_LOCKED  | EXECUTION    | `task_boundary.begin_execution`      | lock still valid              | enable edit/command tools              |
| EXECUTION    | VERIFICATION | `task_boundary.request_verification` | required checklist done       | freeze edit tools                      |
| VERIFICATION | COMPLETE     | `task_boundary.complete`             | verification gate passes      | emit evidence bundle                   |
| PLAN_LOCKED  | DISCOVERY    | `task_boundary.reopen_plan`          | explicit reopen reason        | unlock plan + reset discovery budget   |
| EXECUTION    | PLAN_DRAFT   | runtime contradiction                | contradiction evidence        | reopen planning with amendment         |
| VERIFICATION | EXECUTION    | failed checks                        | remediation window opened     | checkpoint + targeted fixes only       |
| ANY          | BLOCKED      | `task_boundary.block`                | reason non-empty              | persist block reason + next action     |

## 3) External Modes

UI-facing modes are mapped from internal states:

- `PLANNING` -> `DISCOVERY | PLAN_DRAFT | PLAN_LOCKED`
- `EXECUTION` -> `EXECUTION`
- `VERIFICATION` -> `VERIFICATION`

Only `task_boundary` can mutate mode/state.

## 4) Runtime Artifacts (Exact Paths)

Per task, runtime creates:

- `.opencode/heidi/<task_id>/implementation_plan.md`
- `.opencode/heidi/<task_id>/task.json`
- `.opencode/heidi/<task_id>/task.md`
- `.opencode/heidi/<task_id>/verification.json`
- `.opencode/heidi/<task_id>/resume.json`
- `.opencode/heidi/<task_id>/knowledge.jsonl` (optional)

Rules:

- `task.json` is canonical source of truth.
- `task.md` is a synchronized human-readable mirror.
- state changes must be emitted through `task_boundary` and persisted to `task.json` before UI broadcast.

## 5) JSON Schemas

The following schemas are normative contracts for runtime data.

### 5.1 `task.json` schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opencode.dev/schemas/heidi/task.json",
  "title": "HeidiTaskState",
  "type": "object",
  "required": [
    "run_id",
    "task_id",
    "fsm_state",
    "mode",
    "objective",
    "plan",
    "checklist",
    "active_files",
    "changed_files",
    "commands",
    "verification_commands",
    "checkpoints",
    "last_successful_step",
    "next_transition",
    "resume"
  ],
  "properties": {
    "run_id": { "type": "string", "minLength": 1 },
    "task_id": { "type": "string", "minLength": 1 },
    "fsm_state": {
      "type": "string",
      "enum": ["IDLE", "DISCOVERY", "PLAN_DRAFT", "PLAN_LOCKED", "EXECUTION", "VERIFICATION", "COMPLETE", "BLOCKED"]
    },
    "mode": { "type": "string", "enum": ["PLANNING", "EXECUTION", "VERIFICATION"] },
    "objective": {
      "type": "object",
      "required": ["locked", "text"],
      "properties": {
        "locked": { "type": "boolean" },
        "text": { "type": "string", "minLength": 1 }
      },
      "additionalProperties": false
    },
    "plan": {
      "type": "object",
      "required": ["path", "hash", "locked", "amendments"],
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "hash": { "type": "string", "minLength": 1 },
        "locked": { "type": "boolean" },
        "amendments": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "reason", "timestamp"],
            "properties": {
              "id": { "type": "string" },
              "reason": { "type": "string" },
              "timestamp": { "type": "string", "format": "date-time" }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "checklist": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "label", "status", "category"],
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "status": { "type": "string", "enum": ["todo", "doing", "done", "blocked"] },
          "category": { "type": "string", "enum": ["Modify", "New", "Delete", "Verify"] }
        },
        "additionalProperties": false
      }
    },
    "active_files": { "type": "array", "items": { "type": "string" } },
    "changed_files": { "type": "array", "items": { "type": "string" } },
    "commands": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "cmd", "cwd", "profile", "exit_code", "timestamp"],
        "properties": {
          "id": { "type": "string" },
          "cmd": { "type": "string" },
          "cwd": { "type": "string" },
          "profile": { "type": "string" },
          "exit_code": { "type": "integer" },
          "timestamp": { "type": "string", "format": "date-time" }
        },
        "additionalProperties": false
      }
    },
    "verification_commands": { "type": "array", "items": { "type": "string" } },
    "checkpoints": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "step_id", "files", "created_at"],
        "properties": {
          "id": { "type": "string" },
          "step_id": { "type": "string" },
          "files": { "type": "array", "items": { "type": "string" } },
          "created_at": { "type": "string", "format": "date-time" }
        },
        "additionalProperties": false
      }
    },
    "block_reason": { "type": ["string", "null"] },
    "last_successful_step": { "type": "string" },
    "next_transition": { "type": "string" },
    "resume": {
      "type": "object",
      "required": ["next_step", "checkpoint_id"],
      "properties": {
        "next_step": { "type": "string" },
        "checkpoint_id": { "type": ["string", "null"] },
        "failed_hypotheses": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### 5.2 `verification.json` schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opencode.dev/schemas/heidi/verification.json",
  "title": "HeidiVerification",
  "type": "object",
  "required": ["task_id", "status", "checks", "evidence", "warnings"],
  "properties": {
    "task_id": { "type": "string" },
    "status": { "type": "string", "enum": ["pass", "fail", "blocked"] },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "command", "exit_code", "duration_ms"],
        "properties": {
          "name": { "type": "string" },
          "command": { "type": "string" },
          "exit_code": { "type": "integer" },
          "duration_ms": { "type": "integer", "minimum": 0 },
          "log_ref": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "browser": {
      "type": "object",
      "properties": {
        "required": { "type": "boolean" },
        "status": { "type": "string", "enum": ["pass", "fail", "skipped"] },
        "screenshots": { "type": "array", "items": { "type": "string" } },
        "console_errors": { "type": "array", "items": { "type": "string" } },
        "network_failures": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "evidence": {
      "type": "object",
      "required": ["changed_files", "command_summary", "before_after"],
      "properties": {
        "changed_files": { "type": "array", "items": { "type": "string" } },
        "command_summary": { "type": "array", "items": { "type": "string" } },
        "before_after": { "type": "string" }
      },
      "additionalProperties": false
    },
    "warnings": { "type": "array", "items": { "type": "string" } },
    "remediation": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["file", "line", "rule_id", "message", "next_action"],
        "properties": {
          "file": { "type": "string" },
          "line": { "type": "integer", "minimum": 1 },
          "rule_id": { "type": "string" },
          "message": { "type": "string" },
          "next_action": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

### 5.3 `resume.json` schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opencode.dev/schemas/heidi/resume.json",
  "title": "HeidiResume",
  "type": "object",
  "required": [
    "run_id",
    "task_id",
    "fsm_state",
    "objective",
    "plan_ref",
    "completed",
    "pending",
    "touched_files",
    "edited_files",
    "last_validations",
    "failed_hypotheses",
    "next_step",
    "checkpoint_ref"
  ],
  "properties": {
    "run_id": { "type": "string" },
    "task_id": { "type": "string" },
    "fsm_state": { "type": "string" },
    "objective": { "type": "string" },
    "plan_ref": { "type": "string" },
    "completed": { "type": "array", "items": { "type": "string" } },
    "pending": { "type": "array", "items": { "type": "string" } },
    "touched_files": { "type": "array", "items": { "type": "string" } },
    "edited_files": { "type": "array", "items": { "type": "string" } },
    "last_validations": { "type": "array", "items": { "type": "string" } },
    "failed_hypotheses": { "type": "array", "items": { "type": "string" } },
    "next_step": { "type": "string" },
    "checkpoint_ref": { "type": ["string", "null"] },
    "narrative": { "type": "string" }
  },
  "additionalProperties": false
}
```

## 6) Plan Contract (`implementation_plan.md`)

Required sections:

- Task goal
- Background and discovered repo facts
- Scope
- Out-of-scope
- Files to modify
- Files to create
- Files not to touch
- Change strategy by component
- Risks and assumptions
- Verification plan
- Rollback expectations
- Expected evidence

Each planned item is categorized as exactly one of:

- `Modify`
- `New`
- `Delete`

Plan lock requirements:

- plan completeness checks pass
- plan hash persisted in `task.json.plan.hash`
- objective lock set (`task.json.objective.locked = true`)

## 7) `task_boundary` Tool Contract

`task_boundary` is the only legal path to mutate state/checklist/mode.

### 7.1 Request schema

```json
{
  "type": "object",
  "required": ["action"],
  "properties": {
    "run_id": {
      "type": "string",
      "description": "Optional. Auto-derived from persisted state if omitted. When supplied, must match the current run_id in task state."
    },
    "task_id": {
      "type": "string",
      "description": "Optional. Always derived from the caller's session ID. Callers MUST NOT supply a cross-session task_id — the server enforces binding to the current session."
    },
    "action": {
      "type": "string",
      "enum": [
        "start",
        "set_mode",
        "mark_item",
        "lock_plan",
        "reopen_plan",
        "begin_execution",
        "request_verification",
        "block",
        "complete"
      ]
    },
    "payload": { "type": "object" }
  },
  "additionalProperties": false
}
```

> **Auto-fill contract:** The server derives `task_id` from the caller's session ID and `run_id` from persisted state. The model/tool should not supply either — the server fills both. The HTTP route (`POST /session/{sessionID}/task/boundary`) omits `task_id` from the request body entirely and injects it from the URL path.

### 7.2 Response schema

```json
{
  "type": "object",
  "required": ["ok", "fsm_state", "mode", "task_json_version"],
  "properties": {
    "ok": { "type": "boolean" },
    "fsm_state": { "type": "string" },
    "mode": { "type": "string" },
    "task_json_version": { "type": "integer", "minimum": 1 },
    "error": { "type": ["string", "null"] }
  },
  "additionalProperties": false
}
```

## 8) Execution Safety Model

### 8.1 Step checkpoints

Before every state-changing EXECUTION action:

- create checkpoint with `run_id`, `step_id`, touched files, hash/patch snapshot, cwd, command profile
- append execution ledger entry

Preferred storage forms:

- hidden git stash/private ref
- patch + manifest snapshot
- in-memory transaction before write

### 8.2 Deterministic rollback triggers

Rollback to last checkpoint on:

- non-zero command exit
- parser/AST failure
- lint/type/build break introduced by current step
- edit anchor mismatch rejection
- post-edit validation failure

### 8.3 No destructive rollback

Disallow `git reset --hard HEAD~1` style rollback in orchestration logic.

## 9) Editing Tool Contracts

### 9.1 `replace_file_content`

Request fields:

- `path`
- `search_string`
- `replace_string`
- `anchor` (optional context/hash)

Rules:

- anchored replacement required
- reject on anchor mismatch and return current relevant region
- support multi-file transaction mode: validate all anchors -> apply in memory -> fast checks -> commit all or reject all

### 9.2 `write_to_file`

Rules:

- only for explicit creation or declared full rewrite
- created artifacts must be declared in plan or recorded via plan amendment
- log writes in execution ledger and `task.json.changed_files`

### 9.3 `run_command`

Use command profiles (no unrestricted shell mode):

- `read_only`
- `build`
- `test`
- `format`
- `git_safe`
- `app_local`

Each profile defines allowed cwd roots, write policy, timeout, env exposure, and output capture policy.

## 10) Discovery Engine

Hybrid retrieval order:

1. symbol/path lookup
2. exact text search
3. semantic retrieval (optional)

Constraints:

- discovery budget per planning cycle
- prevent repeated reads of same file region without new evidence
- force `PLAN_DRAFT` when budget is exhausted
- incremental index updates only for changed files

## 11) Subagent Contracts

### 11.1 Browser Subagent

- role: verification only
- allowed: navigate, inspect DOM, capture screenshots, console/network capture, route checks
- disallowed: source edits, task state mutation

### 11.2 Knowledge Subagent

- role: background distillation and retrieval support
- inputs: approved boundary outputs only
- outputs: project-scoped knowledge items, compact retrieval summaries
- disallowed: autonomous state transitions

### 11.3 IPC envelope

```json
{
  "request_type": "string",
  "run_id": "string",
  "task_id": "string",
  "payload": {},
  "result": {},
  "status": "ok|fail|blocked",
  "timestamp": "2026-03-19T00:00:00Z"
}
```

## 12) Verification Gate

Entry to `VERIFICATION` requires:

- required checklist items complete
- plan lock valid (or explicit amendment recorded)
- clean execution ledger
- no unresolved blocking errors

Typical verification matrix:

- parse
- format
- lint
- typecheck
- targeted tests
- build
- runtime smoke test
- browser validation (required for UI/routing changes)
- artifact validation

Diagnostics must be structured as remediation items:

- file
- line
- rule id
- message
- suggested next action

## 13) Resume and Compaction

Safe boundaries must persist `resume.json` with:

- current state and mode
- locked objective + plan ref
- completed/pending checklist
- touched/edited files
- passed validations
- failed hypotheses
- next intended step
- active checkpoint ref

Resume sequence:

1. restore runtime state
2. restore `task_boundary` state
3. restore checkpoint metadata
4. inject compact narrative continuation (assistive only)

## 14) Completion Gate

`COMPLETE` allowed only with evidence bundle containing:

- locked or explicitly amended plan
- synchronized `task.json` and `task.md`
- changed files list
- command log summary
- passed verification results
- browser verification (when applicable)
- unresolved warnings list
- concise before/after summary

Loop prevention:

- if repeated same root-cause failure, escalate by reopening plan, marking blocked, narrowing remediation scope, or requesting smaller execution cycle.

## 15) Implementation Rollout

Phase 1: Runtime state and boundary

- FSM
- `task_boundary`
- `task.json` + `task.md` sync
- resume payload

Phase 2: Execution safety

- step checkpoints
- deterministic rollback
- command profiles
- workspace path jail
- execution ledger

Phase 3: Atomic editing

- anchored replace
- multi-file transaction
- fast post-edit validation
- reject partial broken edits

Phase 4: Discovery engine

- symbol/path/text retrieval
- optional embeddings
- incremental indexing
- discovery budgets

Phase 5: Verification system

- verification gate
- structured diagnostics
- evidence bundle generation
- completion rules

Phase 6: Subagents

- browser verifier
- knowledge distiller
- structured IPC
- isolated task authority
