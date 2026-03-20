# Heidi Task: ses_2f5aae82bffeSYxKEsx4wvuxNJ

> **Run ID**: `tool_d0a6ad453001pQA1b2g9vqKPLE`
> **Status**: `COMPLETE` (VERIFICATION)
> **Goal**: Implement Task Analytics telemetry feature: Add telemetry field to TaskState (duration_ms, tool_calls_count), capture metrics in boundary.ts, render stats in task.md Analytics section.

### Progress
- **Last Step**: complete
- **Next Transition**: NONE

### Checklist
#### Modify
- [x] 🟡 packages/opencode/src/heidi/schema.ts - Add Telemetry type and field to TaskState
- [x] 🟡 packages/opencode/src/heidi/boundary.ts - Initialize and track telemetry in apply()
- [x] 🟡 packages/opencode/src/heidi/state.ts - Initialize telemetry and add Analytics section to render()
#### Verify
- [x] 🟡 bun typecheck in packages/opencode
- [x] 🟡 Read task.md to confirm Analytics section rendering
