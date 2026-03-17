# .local/implementation-agent-finish-mode.md

## Current Failure Mode
Agents currently operate in a "permission-seeking" loop. When a tool returns a partial result (e.g., first 100 lines of a file) or when a sub-step is completed, the agent often stops to ask "Would you like me to continue?" or "Should I read the next part?". This creates high friction and breaks the "Super Legend" autonomous contract.

## Finish-Mode Contract
1.  **Autonomy by Default**: The agent must continue execution until the requested outcome is fully achieved.
2.  **Ban Routine Prompts**: Routine check-ins like "want me to keep reading?" or "should I continue?" are strictly prohibited.
3.  **True Blockers Only**: The agent may only interrupt the user if a **True Blocker** is encountered.

## Blocker Rules
A True Blocker is defined as:
- `required_input_missing`: The task requires information ONLY the user can provide.
- `material_ambiguity`: Choosing A or B significantly changes the outcome and the choice is not technical.
- `destructive_approval_required`: An action that cannot be reversed or is high-risk (e.g., deleting a production DB).
- `no_tool_fallback`: All available tools have failed and there is no alternative path.
- `hard_execution_failure`: System-level error that prevents any further progress.

## Auto-Continue Rules
- **Partial Reads**: If `view_file` or `read_url_content` returns a truncated result, the loop MUST automatically trigger the next segment read without user notification.
- **Evidence Gathering**: If the agent is searching/listing and has not found the evidence required by the task, it must proceed to opening relevant files automatically.

## Planned Changes

### Agent Contract
#### [MODIFY] [persona.ts](file:///home/heidi/work/opencode-main/packages/opencode/src/persona.ts)
- Add the strict finish-mode rules to the system prompt template.

### Orchestrator / Runtime
#### [MODIFY] [session/index.ts](file:///home/heidi/work/opencode-main/packages/opencode/src/session/index.ts)
- Modify the `execute` / `loop` logic to support "Outcome-driven" states.
- Inject auto-continue logic for partial tool results.

### Blocker Classifier
#### [NEW] [util/blocker.ts](file:///home/heidi/work/opencode-main/packages/opencode/src/util/blocker.ts)
- Implement `classifyBlocker(state: AgentState): Blocker | null`.

### Verification
#### [NEW] [tools/check_agent_finish_mode.py](file:///home/heidi/work/opencode-main/tools/check_agent_finish_mode.py)
- Wire into `tools/doctor.py`.
- Verify contract presence and classifier logic.

## Proof Results
- [ ] Before: Capture a run where I stop after a partial read.
- [ ] After: Capture the same run finishing automatically.
