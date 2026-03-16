## Objective
Raise real task completion rate and reduce ambiguity by compiling every user request into a structured **Task Object** before execution. This ensures the agent works against a stable contract rather than a raw message string.

## Global Rules (Phase 1)
- **Sync**: Always sync from latest `dev` branch.
- **Branch**: `feat/heidi-p1-task-compiler`.

## Deliverables
1.  **Task Schema**: Define `TaskObject` (goal, constraints, success_criteria, required_evidence, preferred_output, blocker_policy).
2.  **Task Compiler**: A logic layer that transforms `MessageV2.User` into a `TaskObject`.
3.  **Task Integrity**: Validate task completeness. If critical fields are missing, trigger the `required_input_missing` blocker.
4.  **Run State Integration**: Store the compiled task in the session/run state.
5.  **Execution Alignment**: Update the orchestrator to prioritize the Task Object as the primary goal.

## Proposed Changes

### Core Logic
#### [NEW] [task.ts](file:///home/heidi/work/opencode-main/packages/opencode/src/session/task.ts)
- Define `TaskObjectSchema` using Zod.
- Implement `TaskCompiler.compile(request: string): Promise<TaskObject>`.

#### [MODIFY] [session/prompt.ts](file:///home/heidi/work/opencode-main/packages/opencode/src/session/prompt.ts)
- Inject Task Compiler call at the start of a session.
- Store Task Object in the processing context.

### Verification
#### [NEW] [check_p1_task_compiler.py](file:///home/heidi/work/opencode-main/tools/check_p1_task_compiler.py)
- Wire into `tools/doctor.py`.
- Verify schema existence and compiler output stability.

## Verification Plan

### Automated Tests
- `bun test src/session/task.test.ts`: Test compilation of simple vs. vague vs. complex tasks.
- `python3 tools/doctor.py --check p1-task-compiler`.

### Manual Proof
- Capture traces showing the normalized "Success Criteria" for a vague task like "check the server status".
