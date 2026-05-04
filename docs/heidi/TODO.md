# Heidi Antigravity Mission Control: Future Roadmap

Following the successful Phase 1-6 upgrade, this TODO list outlines the remaining high-rank features and optimizations planned for the platform.

## High Priority: Intelligence & Context
- [ ] **Vector Search Integration**: Add `sqlite-vec` adapter to the `HeidiIndexer`. Implement semantic search for files and symbols to complement the keyword index.
- [ ] **Long-Context Reranking**: Integrate a reranking step for `index_search` results to prioritize the most relevant implementation details.
- [ ] **Automated Indexing Hooks**: Wire the indexer into the `Vcs` service to automatically update on branch switch or commit.
- [ ] **Full Feature Extraction**: Implement deterministic extraction for Symbols, Imports, Routes (Fastify), and Tests (Bun) in `HeidiIndexer`.
- [ ] **Indexer Synchronization Lag Monitor**: Add a doctor check to detect when the index is significantly behind the current HEAD.
- [ ] **Public State API Refactoring**: Move internal helper functions like `root` and `path` resolution from `state.ts` into a clean, versioned public API for tools.

## UI/UX & Visibility
- [ ] **Heidi Cinema UI**: Build the high-fidelity session playback interface. Allow developers to "scrub" through agent history with a timeline and view exactly what the agent saw at each step.
- [ ] **Real-time Performance Metrics**: Add token usage, latency, and cost-per-task tracking to the Mission Control dashboard.
- [ ] **Glassmorphism UI Polish**: Refine the `/heidi/mission-control` CSS to match the high-fidelity mockup (blur effects, translucent cards, neon accents).
- [ ] **Mobile-First Dashboard**: Optimize the Mission Control Kanban board for mobile review and approvals.
- [ ] **Style Guide Alignment**: Refactor newly introduced internal identifiers (e.g., `screenshotPath` -> `shot`, `reportPath` -> `rep`) to strictly follow the `AGENTS.md` single-word preference.

## Orchestration & Reliability
- [ ] **Parallel Subagent Spawning**: Allow the primary Heidi agent to spawn multiple specialized subagents (e.g., "Refactor Agent" + "Test Agent") and coordinate their work via the dashboard.
- [ ] **FSM Branching**: Implement the ability to "Branch from Snapshot," allowing a developer to take over a session from a specific point or fork it into a new path.
- [ ] **Adaptive SSE Batching**: Implement network-aware batching logic for the `SSEBatcher` to optimize for high-latency connections.
- [ ] **De-flake Community Skill Tests**: Provide a robust mock or local registry for community skill testing to eliminate the `dynamic_skill` network timeout.

## Governance & Compliance
- [ ] **Automated PR Description Generation**: Automatically generate a GitHub PR description based on the `diff_summary.md` and `task.md` artifacts.
- [ ] **Policy Enforcement Subagents**: Add subagents that check for security vulnerabilities (e.g., hardcoded secrets) during the verification gate.
- [ ] **Visual Regression Testing**: Enhance the `browser_subagent` with pixel-perfect screenshot comparison (pixelmatch) to detect unintended UI regressions.
- [ ] **Artifact Schema Versioning**: Implement a versioning strategy for `verification.json` and artifact metadata to ensure forward compatibility.
- [ ] **Human-in-the-Loop Gates**: Add a "Manager Approval" state to the Kanban board that requires a manual signature for critical production deployments.
