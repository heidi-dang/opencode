# Live Activity Chips Implementation

## Event sources

Live chips are derived from runtime `tool` parts in the session event stream reduction exposed as `data.store.part`.

- Source of truth: `message.part.updated` reductions (already in app sync layer)
- UI derivation point: `packages/ui/src/components/session-turn.tsx`

No polling is used. Chip state follows reactive tool part updates.

## Active activity state model

`ThinkingTheater` now accepts `activities?: LiveActivity[]` with:

- `id`
- `kind` (`tool | command | subagent | verify`)
- `label`
- `status` (`running | completed | error`)
- `start_time`
- `end_time`
- `priority`
- `source_event_id`

Activities are built in `session-turn.tsx` from tool parts and sorted by priority and recency.

## Chip label formatting rules

- Tool names are normalized for readability (`run_command` -> `run command`, etc.)
- Command chips prefer truthful command input fields (`command` or `test_command`)
- Commands are whitespace-normalized and truncated only for display length
- Subagent task chips prefer `subagent_type` when available (e.g. `beast_mode`)

## Priority rules

Priority order implemented:

1. command
2. verify/check
3. edit/write/apply_patch
4. subagent/task
5. read/search/list tools
6. other tools

Completed/error variants are kept below active items via status offset.

## Lifecycle rules

- Tool start (`pending`/`running`) => chip enters immediately
- While running => chip remains visible
- Completed/error => chip remains briefly for exit motion
- Exit window: 900ms after `end_time`
- Re-evaluation is event/timer-driven (single-shot timeout), not polling

## Breakpoint caps

Caps are enforced in `thinking-theater.tsx`:

- desktop: 5
- tablet: 4
- mobile: 3

Overflow renders a truthful `+N active` chip.

## Visual state mapping

- `running`: brighter glow and active appearance
- `completed`: success tint with quick soften/fade
- `error`: warning tint with faster fade
- `command` chips use monospace hint
- `verify`/`subagent` chips use subtle border accents

## Fallback behavior

When there are no live runtime activities, a minimal fallback chip appears by phase (`thinking`, `planning`, `verifying`, `focused`, `reviewing context`).

Fallback is only used when live activities are empty.
