# Implementation Plan: Task Analytics Telemetry

## Task goal

Add telemetry field to TaskState (duration_ms, tool_calls_count), capture metrics in boundary.ts, render stats in task.md Analytics section.

## Background and discovered repo facts

- TaskState lives in packages/opencode/src/heidi/schema.ts (lines 28-79)
- boundary.ts applies actions to TaskState via HeidiBoundary.apply() (lines 191-333)
- state.ts renders TaskState to task.md via render() function (lines 155-185)
- TaskState already tracks commands[] with timestamps
- VerifyState already has duration_ms in checks[]

## Scope

- Add Telemetry type to schema.ts with duration_ms and tool_calls_count
- Update TaskState to include optional telemetry field
- Update boundary.ts to initialize and update telemetry on each action
- Update state.ts ensure() to initialize telemetry
- Update state.ts render() to display Analytics section in task.md

## Out-of-scope

- Changes to database persistence
- Changes to verify.ts (VerifyState already has per-check duration_ms)
- Changes to ResumeState or ContextState

## Files to modify

- packages/opencode/src/heidi/schema.ts (Modify)
- packages/opencode/src/heidi/boundary.ts (Modify)
- packages/opencode/src/heidi/state.ts (Modify)

## Files to create

- None

## Files not to touch

- None

## Change strategy by component

### schema.ts

1. Add Telemetry schema BEFORE TaskState (after line 27):
   export const Telemetry = z.object({
     duration_ms: z.number().optional(),
     tool_calls_count: z.number().optional(),
     started_at: z.string().optional(),
   })

2. Add to TaskState after resume field:
   telemetry: Telemetry.optional(),

3. Export: export type Telemetry = z.infer<typeof Telemetry>

### boundary.ts

1. In start action: Initialize telemetry with started_at timestamp
2. At top of apply(): Increment tool_calls_count on every action
3. In complete action: Calculate duration_ms = Date.now() - Date.parse(started_at)

### state.ts

1. In ensure() init: Add telemetry: { tool_calls_count: 0 }
2. In render(): Add Analytics section before Checklist

## Verification plan

- bun typecheck in packages/opencode
- Read task.md output to confirm Analytics section
