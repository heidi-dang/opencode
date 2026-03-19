# Heidi Agentic Architecture Roadmap

Heidi is a high-autonomy, planning-first, multi-agent coding system built for real software engineering tasks with strong state control, precise tooling, and deterministic recovery.

## Phases of Development

### Phase 1: Runtime State and Boundary (Current)
- **Canonical FSM**: Formalize `IDLE` -> `DISCOVERY` -> `PLAN_DRAFT` -> `PLAN_LOCKED` -> `EXECUTION` -> `VERIFICATION` -> `COMPLETE`.
- **Task Boundary**: Implement `task_boundary` as the single source for state transitions.
- **Machine State**: Implement authoritative `task.json` synchronized with human-readable `task.md`.
- **Resume Safety**: Add structured resume payloads for deterministic recovery.

### Phase 2: Execution Safety
- **Step Checkpoints**: Hidden snapshots before every state-changing action (hidden git stash/private refs).
- **Deterministic Rollback**: Automatic restoration of last clean checkpoint on failure (build breaks, lint errors).
- **Command Profiles**: Restricted shell access (read_only, build, test, etc.) with timeout and capture policies.
- **Workspace Jail**: Strict path resolution to prevent escaping workspace roots.

### Phase 3: Atomic Editing
- **Anchored Replacements**: `replace_file_content` with target strings and context anchors to prevent drift.
- **Multi-File Transactions**: Atomic application of changes across multiple files.
- **Fast Validation**: Periodic post-edit checks (parse, fast lint) to reject broken edits early.

### Phase 4: Discovery Engine
- **Hybrid Indexing**: Symbol lookup, path index, and exact search combined with lightweight embeddings.
- **Incremental Intelligence**: Only update changed files; build baseline on startup.
- **Discovery Budget**: Impose limits on searching to force a transition to planning.

### Phase 5: Verification System
- **Verification Gate**: Transition to `COMPLETE` blocked until checklist is done and evidence is collected.
- **Evidence Bundle**: Generation of a summary package (changed files, command logs, before/after).
- **Browser Validation**: Autonomous UI smoke tests using the Browser Subagent.

### Phase 6: Subagents
- **Isolated Workers**: Browser and Knowledge subagents with narrow IPC contracts.
- **Browser Subagent**: UI verification, SPA routing confirmation, and screenshot capture.
- **Knowledge Subagent**: Background distillation of task knowledge and retrieval support.

---
*Heidi is implemented as an orchestration layer within the existing OpenCode runtime.*
