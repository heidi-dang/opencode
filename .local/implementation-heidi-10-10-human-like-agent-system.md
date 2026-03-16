# Heidi 10/10 Human-Like Agent System

## Objective
Build Heidi into an outcome-driven, hard-to-fail, human-like agent system that completes real tasks with very high success, almost never asks routine questions, recovers cleanly from mistakes, remains stable on long runs, improves from past failures, and internally pursues the strongest reachable result before stopping.

## Product Definition
A practical 10/10 Heidi agent finishes most real tasks, picks the right files and tools quickly, verifies its own work, recovers from failures without user help in most cases, resumes cleanly after interruption, avoids exposing internal confusion, asks only when a true blocker exists, and returns the best result it can justify with evidence rather than the first acceptable answer.

## Core Execution Principle
Heidi must not aim for the first acceptable answer. Heidi must pursue the strongest result it can justify with the available evidence, time, and tools, and only stop when further improvement is not meaningfully beneficial.

## System Architecture

### Layers
1. **Finish-Mode Runtime**: Stop routine check-ins and force outcome-driven execution.
2. **Task Compiler**: Convert raw user asks into execution-ready task contracts.
3. **Planner**: Turn the compiled task into an execution plan and hypothesis tree.
4. **Context Engine**: Provide sharp context instead of giant context dumps.
5. **Specialist Router**: Route work to the right execution lane (Python, TS/UI, etc.).
6. **Tool Competence Policy**: Teach Heidi how to work (cheapest check first, etc.).
7. **Verifier**: Treat first output as untrusted until proven by evidence.
8. **Recovery Engine**: Recover intelligently instead of retrying blindly.
9. **Persistent Run Memory**: Support long-horizon stability and clean resume.
10. **Failure-Learning Store**: Make repeated work smarter over time.
11. **Benchmark Gate**: Prevent regressions and prove real-world quality.
12. **Best-Result Engine**: Engineer internal ownership of outcome quality and control the stopping rule.

---

## Task Object Schema
Every request is compiled into:
- **goal**: Primary objective.
- **constraints**: Non-negotiable limits.
- **success_criteria**: Measurable outcomes.
- **required_evidence**: Proof needed for completion.
- **allowed_tools**: Verified tool whitelist.
- **blocker_rules**: Class-based stopping criteria.
- **preferred_output_format**: Final delivery structure.

---

## Blocker Classes
- `required_input_missing`: Missing info that cannot be found in the repo.
- `material_ambiguity`: Conflicting instructions that block progress.
- `destructive_approval_required`: High-risk actions (e.g., deleting production data).
- `no_tool_fallback`: Required task cannot be done with available tools.
- `hard_execution_failure`: Repeated recovery failures with no new path.

---

## Best-Result Engine Strategy
Sit above the execution stack and control the stopping rule:
1. **Quality Rubric Builder**: Generate task-specific metrics (correctness, robustness, etc.).
2. **Result Scorer**: Evaluate candidate outcomes against the rubric.
3. **Gap Detector**: Identify missing evidence or weak areas.
4. **Dissatisfaction Signal**: Drive continuation if reachable quality is higher.
5. **Bounded Stop Rule**: Balance ambition with cost/time budget.

---

## Implementation Phases

| Phase | Component | Key Deliverables |
|-------|-----------|------------------|
| P0 | Finish-Mode Runtime | Contract, Classifier, Auto-continue, States (running/blocked/complete). |
| P1 | Task Compiler | Full Task Object integration, downstream consumption. |
| P2 | Context Engine | Targeted retrieval, repo maps, working set manager. |
| P3 | Specialist Router | Lane-based routing with explicit tool/context policies. |
| P4 | Tool Competence | cheapest check policy, bounded retries, path selection laws. |
| P5 | Verifier | evidence-first validation, regression risk assessment. |
| P6 | Recovery Engine | Intelligent failure mapping, rollback, anti-thrash logic. |
| P7 | Persistent Memory | Crash-safe run states, checkpointed progress. |
| P8 | Failure Learning | Failure journal, heuristic feedback for planner/router. |
| P9 | Benchmark Gate | metric scoring harness, release regression gate. |
| P10 | Best-Result Engine | Rubric builder, Scorer, Dissatisfaction signal, Stop rule. |

## Target Metrics
- **Completion Rate**: Very high on benchmark corpus.
- **Interruption Rate**: Near zero for routine work.
- **Blocker Precision**: High; questions only when truly necessary.
- **Recovery Rate**: High on tasks with initial local failures.
- **Time to Completion**: Stable and competitive.
