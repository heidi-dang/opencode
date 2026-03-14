---
description: Infinity Cycle Workflow 5.0 (Deterministic Architecture)
---

# Infinity Cycle Workflow 5.0

A strictly routed, schema-driven, enterprise-grade autonomous development pipeline. Every agent has a hard contract. All state is structured. The graph is deterministic.

## Architecture

```
Suggester ──→ queue.json ──→ Planner ──→ Dev Swarm ──→ Havoc ──→ Reporter ──→ Librarian
                                ↑              │                      │
                                │         stuck packet                │
                                │              ↓                      │
                                └──── Planner ←── Master              │
                                         ↑                           │
                                         └───── gate result ─────────┘
```

## Authority Model

| Agent | Authority | Forbidden |
|-------|-----------|-----------|
| Suggester | Write candidate tasks to `queue.json` | Route, assign, escalate, tool-forge |
| Planner | Approve tasks, assign workers, tool-forge, escalate to Master | Execute code, write memory, run gates |
| Dev | Execute plan, emit packets | Mutate queue, call agents, tool-forge |
| Master | Diagnose stuck escalations | Complete tasks, merge, assign |
| Havoc | Chaos-test code, pass/reject | Merge, plan, route |
| Reporter | Run deterministic gates | Plan, rescue, brainstorm |
| Librarian | Extract post-pass lessons | Write from failed runs |
| Oracle | Answer codebase queries | Mutate anything |

## State Layout

```
.opencode/
  queue.json                    # backlog items only (task schema)
  schemas/
    task.schema.json            # hard task schema
    stuck.schema.json           # structured stuck packet
    gate.schema.json            # gate result bundle
    run-state.schema.json       # live run state
  knowledge/
    patterns/                   # successful patterns (post-pass only)
    gotchas/                    # mistakes to avoid (post-pass only)
    decisions/                  # design decisions (post-pass only)
  runs/
    <run-id>/
      state.json               # live execution state
      plan.json                # assigned plan
      events.jsonl             # progress/stuck/completion packets
      artifacts/               # logs, diffs, reports
      notes/                   # temporary librarian observations
```

## The Deterministic Pipeline

### 1. Demand Generation (Suggester)
- Audits repo, triages GitHub issues, runs Tech Radar
- Profiles cost and carbon inefficiency
- Proposes A/B variants for major changes
- Dedupes against existing queue
- Emits exactly 2-3 structured candidate tasks to `queue.json`
- **STOPS**. Does not route or assign.

### 2. Routing & Planning (Planner)
- Reads `queue.json`, dedupes by fingerprint (title + scope + acceptance)
- Safety check: halts for destructive operations, requires human approval
- Queries `oracle` for codebase context
- Reads `.opencode/knowledge/` for past lessons
- Calculates system capacity via `nproc` / `free -m`
- Scope-aware parallelism: only splits when file scopes do NOT overlap
- Creates `.opencode/runs/<run-id>/` with `state.json` + `plan.json`
- Assigns Dev workers
- Handles stuck packets: resolves directly or escalates to Master

### 3. Execution (Dev Swarm)
- Executes assigned plan from `plan.json`
- Emits structured packets to `events.jsonl`: progress, stuck, completion
- On stuck after 2 attempts: emits stuck packet and STOPS
- On completion: emits completion packet and STOPS
- Cannot mutate queue, call agents, or run gates

### 4. Escalation (Master)
- Invoked only by Planner when stuck packet cannot be resolved
- Reads evidence pack (stuck packet + run artifacts)
- Returns ranked diagnosis with next actions
- Planner incorporates diagnosis into revised plan

### 5. Chaos Testing (Havoc)
- Intercepts completed Dev work before Reporter
- Attacks with malformed inputs, timeouts, concurrency stress
- Pass → proceeds to Reporter
- Reject → returns to Dev with crash report

### 6. Gate Evaluation (Reporter)
- Receives task result bundle
- Runs deterministic gates based on changed files:
  - `ui/**`, `*.tsx`, `*.css` → Visual Gate (vortex)
  - `auth/**`, `runtime/**` → Security Gate (sentry)
  - Any code → Cloud Gate (CI/CD via gh)
  - Docs only → skip CI-heavy
- A/B benchmarking: only passes the mathematically superior variant
- Returns structured gate bundle: `pass | fail | blocked | retry_with_actions`
- Auto-rollback on CI failure: `git revert HEAD`

### 7. Memory Extraction (Librarian)
- Only invoked after Reporter returns `pass`
- Writes temporary notes to `.opencode/runs/<run-id>/notes/`
- Promotes approved lessons to `.opencode/knowledge/` (patterns, gotchas, decisions)
- Never writes from failed or partial runs

## Ignition

```bash
task description="Ignite Infinity Swarm" prompt="Run internal stability audit plus GitHub issue triage. Produce exactly 3 prioritized backlog items in the queue schema, dedupe against existing queued or in-progress tasks, and write only to .opencode/queue.json. Do not start implementation." subagent_type="suggester"
```
