# Implementation Plan

## Task goal

Fix thinking card overlap, mobile chip behavior, and replace orb with cute Heidi identity including doctor checks and implementation doc

## Background and discovered repo facts

- User provided redesigned thinking copy pack replacing shared pool with phase-specific title/subtitle/chips
- Current thinking-wording.ts uses shared pool approach, no tone support, no focused/warning copy sets
- New pack adds tone modes (plain/friendly/fun), deterministic helpers (sceneAt/subtextAt/chipSet), thinkingState bundle
- Must keep focused and warning Phase entries already added to codebase

## Scope

- Only packages/ui/src/lib/thinking-wording.ts and packages/ui/src/components/thinking-theater.tsx
- No other files, no orb changes, no card layout changes

## Out-of-scope

- Orb component changes (already done)
- Card layout changes (already done)
- Doctor checks (already done)

## Files to modify

- packages/ui/src/lib/thinking-wording.ts (replace with new copy pack + focused/warning entries)
- packages/ui/src/components/thinking-theater.tsx (update to use sceneAt/subtextAt/chipSet API)

## Files to create

- None

## Files not to touch

- All other files

## Change strategy by component

- thinking-wording.ts: Write full new copy pack, add FOCUSED* and WARNING* title/subtitle/chips arrays, add ToneMode/ThinkingCopyPack types, keep backward compat scenes() function, add subtexts() chipSet() sceneAt() subtextAt() thinkingState()
- thinking-theater.tsx: Update imports to use sceneAt/subtextAt from new API, replace rotating signal logic to use sceneAt/subtextAt for title and subtext, replace random chip interval with deterministic chipSet on phase change

## Risks and assumptions

- Assumes thinking-theater.tsx already imports from thinking-wording.ts - confirmed
- Assumes no other consumers of SUBTEXTS or THOUGHT_CHIPS constants - confirmed via grep

## Verification plan

- bun typecheck in packages/ui
- python3 tools/doctor.py
- git diff --stat

## Rollback expectations

- Single git revert of two files restores previous state

## Expected evidence

- TypeScript errors: none
- Doctor checks: all pass
- Changed files: exactly two TS files
