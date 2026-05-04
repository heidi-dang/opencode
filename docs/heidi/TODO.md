# Heidi Antigravity Mission Control: Future Roadmap

Following the successful Phase 1-6 upgrade, this TODO list outlines the remaining high-rank features and optimizations planned for the platform.

## High Priority: Intelligence & Context
- [ ] **Vector Search Integration**: Add `sqlite-vec` adapter to the `HeidiIndexer`. Implement semantic search for files and symbols to complement the keyword index.
- [ ] **Long-Context Reranking**: Integrate a reranking step for `index_search` results to prioritize the most relevant implementation details.
- [ ] **Automated Indexing Hooks**: Wire the indexer into the `Vcs` service to automatically update on branch switch or commit.

## UI/UX & Visibility
- [ ] **Heidi Cinema UI**: Build the high-fidelity session playback interface. Allow developers to "scrub" through agent history with a timeline and view exactly what the agent saw at each step.
- [ ] **Real-time Performance Metrics**: Add token usage, latency, and cost-per-task tracking to the Mission Control dashboard.
- [ ] **Mobile-First Dashboard**: Optimize the Mission Control Kanban board for mobile review and approvals.

## Orchestration & Reliability
- [ ] **Parallel Subagent Spawning**: Allow the primary Heidi agent to spawn multiple specialized subagents (e.g., "Refactor Agent" + "Test Agent") and coordinate their work via the dashboard.
- [ ] **FSM Branching**: Implement the ability to "Branch from Snapshot," allowing a developer to take over a session from a specific point or fork it into a new path.
- [ ] **SSE Batching Optimizations**: Further reduce latency by implementing binary-delta SSE streams for large terminal outputs.

## Governance & Compliance
- [ ] **Automated PR Description Generation**: Automatically generate a GitHub PR description based on the `diff_summary.md` and `task.md` artifacts.
- [ ] **Policy Enforcement Subagents**: Add subagents that check for security vulnerabilities (e.g., hardcoded secrets) during the verification gate.
- [ ] **Human-in-the-Loop Gates**: Add a "Manager Approval" state to the Kanban board that requires a manual signature for critical production deployments.
