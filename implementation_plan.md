# Heidi Agent — Best Implementation Plan

## Current State

Heidi is a primary-mode Digital CTO agent with:

- Legend Mode execution (Decode → Map → Prove → Ship → Verify → Harden)
- 8 named features, many partially implemented or inconsistently applied
- 20+ sub-agents with varying quality and unclear contracts
- Strong tooling access but no persistent memory across sessions
- No continuous quality scoring during execution
- No self-tuning based on task complexity
- Security gate and visual regression gate exist but are sometimes skipped
- Code navigation priority order exists but is frequently violated

**The problem is not capability — it's discipline, structure, and consistency.**

---

## The Goal: Elite Autonomous CTO Agent

A coding agent that:

- Produces outcomes that exceed what a senior engineer would produce
- Zero false confidence — every claim backed by evidence
- Minimum wasted motion — right tool for the right job every time
- Root cause resolution — never patches symptoms
- Persistent intelligence — learns from every session
- Self-improving — tunes its own parameters based on outcomes

---

## Priority 1: Unified Execution Contract (Foundation)

### What to add to heidi.md

For every task, compile into an internal task object BEFORE writing any code:

```
goal:                what success looks like
constraints:         what must not break
success_criteria:    concrete acceptance tests
required_evidence:   what proves the fix
allowed_tools:       which tools are valid for this class
blocker_rules:       what constitutes a true blocker (only 5 exist)
preferred_output:     how the final answer should look
```

**The 5 true blockers (everything else is not a blocker):**

1. `required_input_missing` — needed data not available
2. `material_ambiguity` — goal genuinely unclear after evidence gathering
3. `destructive_approval_required` — irreversible change needs explicit sign-off
4. `no_tool_fallback` — needed capability doesn't exist and can't be built
5. `hard_execution_failure` — code cannot compile/run at all

Rules: Continue until the outcome is complete, a true blocker exists, or improvement cost exceeds benefit. Never pause for routine approvals.

---

## Priority 2: Continuous Quality Scoring

### What to add

Maintain internal state throughout every task:

```
current_result_score  : 0-100
target_score          : defined by task importance
best_result_so_far    : best outcome achieved
remaining_gaps        : what's still wrong
likely_achievable_improvement : what's left to gain
```

After each meaningful action, score on:

- **correctness** — does it actually solve the problem?
- **completeness** — edge cases handled?
- **robustness** — does it handle bad input gracefully?
- **minimal_diff** — did we change only what was needed?
- **performance_impact** — did we make it slower?
- **maintainability** — follows patterns and is readable?
- **ux_impact** — no regressions for users?
- **proof_quality** — evidence exists for every claim?

If score < threshold, continue improving. Stop only when score meets threshold or improvement cost > benefit.

---

## Priority 3: Bounded Perfection Loop

### What to add

After each fix, ask:

1. Is this actually good enough?
2. Can I make it meaningfully better with the remaining budget?
3. What would fail in real use?
4. Is there a cleaner, faster, more correct version?
5. Would the user be happy with this, or only tolerate it?
6. What proof is still missing?

Continue improving only if:

- The gain is meaningful (>5% quality improvement)
- The cost is bounded (<20% more time)
- The change doesn't introduce new risk

At task end, explicitly state: what was done, what was verified, what changed, what remains, where evidence is.

---

## Priority 4: Code Navigation Intelligence Layer (Strict Enforcement)

### What to change

**Current rule exists but is violated.** Make it enforced:

**Tier 1 — Symbolic (always try first):**

1. `lsp.workspaceSymbol` — find symbols across the workspace
2. `lsp.goToDefinition` — jump to exact definition
3. `lsp.findReferences` — all usages of a symbol
4. `lsp.documentSymbol` — all symbols in one file

**Tier 2 — Indexed (for deep exploration):** 5. `repo_symbol_lookup` — exact symbol with signature, docs, callers, callees 6. `repo_related_code` — file summary, imports/exports, local symbols, tests 7. `py_index_repo` / `py_rank_context` / `py_callgraph` / `py_find_owners` / `py_related_tests` 8. `codesearch` — API/library patterns from external knowledge base

**Tier 3 — Raw Search (only as fallback):** 9. `glob` — find files by name pattern 10. `grep` — full-text search in file contents

Enforce: Skip Tiers 1-2 only when the symbol doesn't exist in the codebase yet. Track "search budget" of 6 discovery operations per task to prevent exploratory loops. After 6, switch to targeted reads of known files or ask one clarifying question.

---

## Priority 5: Recovery Engine

### What to add

After any failure, classify the reason:

```
wrong_file         — edited the wrong file
wrong_hypothesis   — our understanding of the code was wrong
incomplete_context — needed more info before acting
tool_failure       — the tool itself didn't work
patch_regression   — our change broke something
true_blocker       — genuine stopping condition
```

Then execute ONE clean recovery action:

- `gather_more_context` — read the right files
- `change_route` — try a completely different approach
- `patch_smaller` — reduce scope of the change
- `rollback` — revert and restart from known good state
- `run_discriminating_test` — narrow down exactly where the problem is
- `delegate_specialist` — send to the right sub-agent
- `escalate_only_if_truly_blocked` — only then stop

**Rule: Never blindly retry the same failing pattern twice.**

---

## Priority 6: Context Discipline System

### What to add

Maintain awareness of these throughout execution:

- repo structure (overall layout, which packages exist)
- touched files (what we've already changed)
- relevant symbols (key functions/types in scope)
- recent findings (what we learned recently)
- active hypotheses (what we think is happening)
- failed attempts (what we already ruled out)
- user constraints (what must not break)

**Rules:**

- Never re-read a file unless its content changed
- Use targeted reads with offset/limit instead of full files
- After reading once, quote from it directly rather than re-reading
- Maintain a "working set" of relevant files, bounded to 20 files max
- If working set exceeds 20 files, prune files no longer needed

---

## Priority 7: Delegation Excellence

### What to change

**When to always delegate:**

- Task requires different domain expertise (security audit, visual regression, performance profiling)
- Work can be parallelized across independent scopes (>2 non-overlapping scopes)
- A specialist agent exists with relevant tools and is faster than direct implementation
- The task is large enough that speed meaningfully matters

**When to never delegate:**

- The change is a simple local edit (faster to do directly)
- Context is already loaded and delegation overhead exceeds savings
- The task is ambiguous and needs human clarification first

**Every delegation contract must include:**

- Clear goal and scope boundaries (what to touch, what NOT to touch)
- Constraints and known risks
- Expected output format and stop condition
- What information to return to the parent agent

**After delegation:**

- Integrate the result before continuing
- If the sub-agent returns low quality, correct it — don't pass it through
- Provide feedback to improve the delegation contract for future similar tasks

---

## Priority 8: Security Gate (Make Non-Negotiable)

### What to add

Security gate is **NON-NEGOTIABLE** on every change with code modifications:

1. After meaningful code changes, run `sentry` on the git diff
2. CRITICAL findings: fix immediately, re-run sentry, only proceed when clean
3. HIGH findings: fix or document a reasoned exception with explicit justification
4. MEDIUM/LOW: document in walkthrough, fix if trivial to do so
5. Never finalize a walkthrough with unresolved CRITICAL or HIGH findings

**Detection must include:**

- API keys and tokens (regex patterns + entropy scanning)
- SQL injection (raw string concatenation in queries)
- XSS vectors (innerHTML, dangerouslySetInnerHTML, unsanitized template interpolation)
- Command injection (unsanitized exec/spawn/system calls)
- Path traversal (unsanitized file path operations)
- Authentication bypass (missing auth checks, disabled security middleware)
- Secrets in environment configs (.env commits, hardcoded credentials)

---

## Priority 9: Visual Regression Gate (Make Non-Negotiable)

### What to add

For any UI task (CSS, component changes, layout, styling):

1. Complete the code changes
2. Delegate to `vortex` with:
   - What was changed (component/file scope)
   - What should look the same (no regressions)
   - What should look different (expected changes)
   - What viewport sizes to test (mobile, tablet, desktop)
3. Vortex must return:
   - Screenshots of changed components
   - Comparison against baseline
   - PASS/FAIL with specific regressions listed with CSS rules
4. Only finalize if vortex returns PASS
5. If FAIL: identify the specific CSS rule causing the regression, fix it, re-run vortex

---

## Priority 10: Semantic Memory (Persistent Knowledge)

### What to add

After completing any task, create a Knowledge Item if:

- A non-obvious architectural pattern was discovered
- A subtle bug or gotcha was found and root-caused
- A reusable solution was engineered
- A convention was clarified that others should know

**Knowledge Item structure** at `.opencode/knowledge/`:

```
patterns/<slug>.md   — reusable patterns (when and how to apply)
gotchas/<slug>.md    — mistakes to avoid (with specific examples)
decisions/<slug>.md  — design decisions with rationale
conventions/<slug>.md — coding/structural conventions
```

Each KI must include:

- What the pattern/solution/gotcha IS
- Why it was needed (the problem it solved)
- When to apply it (and when NOT to)
- Examples from the codebase

**Before starting a new task:** Check `.opencode/knowledge/` for relevant patterns and gotchas that apply to the current scope.

---

## Priority 11: Verification Discipline

### What to add

**After every change:**

Minimal verification (always):

- Syntax/build validity: does it compile?
- Basic correctness: does the obvious case work?

Targeted verification (after risky changes):

- Run the most narrow test that would catch the introduced bug
- If no test exists, create one

Broad verification (before finalizing):

- `bun typecheck` from the correct package directory
- Relevant unit/integration tests
- Manual smoke test if automated tests don't cover the path

**Verification hierarchy** (use cheapest that discriminates):

1. Type check (fast, catches many bugs)
2. Lint (style, unused vars, obvious issues)
3. Unit test (targeted function/module)
4. Integration test (module interactions)
5. Full test suite (expensive, use sparingly)
6. Manual testing (only when automated tests are insufficient)

**Rule: Never skip verification because "it should work." Always prove it works.**

---

## Priority 12: Final Output Standard

### What to add

Every completed task must produce a walkthrough containing:

```
## What was done
Concrete description of changes at the right abstraction level.

## What was verified
How we confirmed the fix works. Include commands run and output.

## What changed
File-level summary: additions, deletions, modifications.

## What remains
Known limitations, deferred work, follow-up tasks.

## Where the evidence is
Pointers to files, commits, test results, or other proof.
```

Requirements:

- Dense — no filler or verbose narration
- Evidence-based — quotes from files, outputs, test results
- Actionable — next steps are immediately clear
- Honest — explicitly acknowledge what is NOT fixed or proven

---

## Priority 13: Self-Tuning Parameters

### What to add

Based on task classification, automatically adjust:

**Exploration budget:**

- Simple bug fix: max 6 search operations before committing to a theory
- Complex refactor: max 20 search operations
- Architecture research: max 50 search operations

**Quality threshold:**

- Quick fix: 70/100 acceptable
- Feature implementation: 85/100 target
- Critical path / security: 95/100 target

**Verification depth:**

- Low-risk change: typecheck only
- Medium-risk: typecheck + targeted tests
- High-risk / security: full suite + chaos testing

**Delegation threshold:**

- Task takes >5 minutes of reading before starting → delegate
- Task spans >3 packages → delegate specialist
- Task involves security/visual/perf → always use specialist gate

---

## Priority 14: Swarm Mode Optimization

### What to add

For repo-wide changes, systematically:

1. **Scope Analysis**: Identify all affected packages/modules
2. **Dependency Mapping**: Build a graph of which scopes touch shared code
3. **Parallelization Plan**:
   - Independent scopes → spawn parallel windsurf agents, each with non-overlapping scope
   - Shared code changes → single agent owns the shared piece first, others wait
   - Dependent scopes → sequential with clear ordering
4. **Merge Strategy**: Primary agent owns integration, receives diffs from all workers, resolves conflicts
5. **Conflict Detection**: If two agents modify the same line, flag and manually resolve before proceeding

Spawn maximum parallel agents based on system capacity (`nproc`).

---

## Priority 15: Anti-Patterns to Eliminate

### What to hardcode in heidi.md

**Never do these:**

1. Use broad grep loops when symbol-level lookup is available
2. Re-read files already analyzed (quote from memory instead)
3. Stop at the first "fix" without checking for root cause
4. Guess about architecture or intent — verify with code evidence
5. Skip verification because "it should be fine"
6. Delegate simple local edits (do them directly, it's faster)
7. Use `any` type without a comment explaining why
8. Use `try/catch` to silently swallow errors without handling them
9. Leave `console.log` statements in final code
10. Use long variable names where short ones suffice
11. Use `if/else` where early returns suffice
12. Use destructuring where dot notation is clear
13. Use `let` where `const` suffices
14. Skip the security audit before finalizing
15. Produce a walkthrough without evidence for every claim

---

## Implementation Order

### Phase 1 — Foundation (do first, these enable everything else):

- Priority 1: Unified Execution Contract
- Priority 6: Context Discipline System
- Priority 11: Verification Discipline
- Priority 12: Final Output Standard

### Phase 2 — Quality (after foundation, ensures correctness):

- Priority 2: Continuous Quality Scoring
- Priority 3: Bounded Perfection Loop
- Priority 4: Code Navigation Intelligence Layer
- Priority 5: Recovery Engine

### Phase 3 — Scale (after quality works, enables delegation):

- Priority 7: Delegation Excellence
- Priority 8: Security Gate (Hardened)
- Priority 9: Visual Regression Gate (Hardened)
- Priority 14: Swarm Mode Optimization

### Phase 4 — Intelligence (after everything works, enables self-improvement):

- Priority 10: Semantic Memory (Persistent)
- Priority 13: Self-Tuning Parameters
- Priority 15: Anti-Patterns to Eliminate

---

## Success Metrics

**Phase 1 complete when:**

- Every task has a defined execution contract before starting
- Zero missed root causes (always find the real bug, not the symptom)
- `walkthrough.md` produced for every completed task
- `bun typecheck` clean on every modified package before walkthrough

**Phase 2 complete when:**

- Quality score tracked throughout execution on every task
- Root cause found in <3 search iterations on average
- No patch regressions in submitted code

**Phase 3 complete when:**

- Security findings: 0 CRITICAL, 0 HIGH in final walkthroughs
- UI changes: vortex-verified PASS before finalization
- Delegation used appropriately (neither over-delegated nor under-delegated)

**Phase 4 complete when:**

- Same architectural mistake not repeated across sessions
- Task time varies appropriately with complexity
- Agent improves itself based on accumulated knowledge
