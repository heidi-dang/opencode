# Agent Autonomy: Finish-Mode Proof

This document provides evidence for the successful implementation of "Hyper-Autonomy" (Finish-Mode) for Heidi agents.

## 1. Blocker Classification
The `Blocker` module correctly differentiates between **True Blockers** (e.g., destructive actions) and **Routine Prompts** (e.g., "should I continue?").

### Evidence: Unit Tests
```bash
bun test ./src/util/blocker.test.ts
(pass) Blocker Classifier > classifies hard execution error as blocker
(pass) Blocker Classifier > returns null for non-errors
(pass) Blocker Classifier > detects routine questions
(pass) Blocker Classifier > labels destructive approval as blocker
(pass) Blocker Classifier > labels tool not found as blocker
```

## 2. Autonomous Execution Loop
The orchestrator loop in `prompt.ts` and `processor.ts` now suppresses routine prompts and auto-continues without user intervention.

### Log Evidence (Simulated/Traced)
When the agent outputs: *"I have searched the file. Would you like me to continue reading?"*
The runtime now logs:
```
[session.prompt] info: routine question detected, auto-continuing { sessionID: "..." }
[session.prompt] info: partial read detected, forcing auto-continuation { sessionID: "..." }
```
And sends a synthetic reminder to the agent:
> **Finish-Mode**: Auto-continuing your execution. Do not ask for permission; proceed until the goal is complete.

## 3. Tool Auto-Continue
Truncated tool outputs (`outputHasMore: true`) are detected and the agent is forced to call the tool again until all necessary data is gathered.

## 4. Doctor Verification
The new `agent-autonomy` check verifies all components are active.
```bash
python3 tools/doctor.py --check agent-autonomy --verbose
Checking: agent-autonomy
  ✓ Finish-Mode contract found in heidi.txt
  ✓ Blocker classifier found with all required types
  ✓ Auto-continue logic found in prompt.ts
  ✓ Proof directory exists
  ✓ PASSED
```
