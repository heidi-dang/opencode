# Workflow Audio Playback Restoration

Fix missing workflow audio playback by correcting volume scaling, centralizing workspace-aware audio URLs, and aligning preview/runtime playback paths.

---

## Problem statement

Workflow audio is effectively silent during active workflow playback, and manual preview in the Audio settings page is also silent. Investigation found at least one confirmed runtime bug (double volume scaling) and a likely pathing mismatch caused by root-relative `/audio/...` URLs in a workspace-routed app.

---

## Current architecture summary

- Runtime workflow events are emitted from `packages/opencode/src/audio/runtime-hooks.ts` and published via `workflow.audio` transport.
- `packages/app/src/lib/audio/audio-service.tsx` listens for `workflow.audio`, parses events, queues them, and calls the audio player.
- `packages/app/src/lib/audio/audio-player.ts` owns HTMLAudio playback.
- `packages/app/src/lib/audio/audio-settings.ts` builds workflow audio URLs.
- `packages/app/src/components/settings-audio.tsx` provides manual preview buttons.
- `packages/app/src/routes/internal/audio-preview/index.tsx` loads and plays generated preview assets.

---

## Root causes identified

1. **Confirmed:** volume is scaled twice in the workflow runtime path.
   - `audio-service.tsx` passes `settings.workflowAudio.volume() / 100`
   - `audio-player.ts` divides by 100 again
   - default 70 becomes 0.007 actual playback volume

2. **Likely:** workflow audio URLs are built as raw `/audio/...` root paths, while the app is workspace-routed under `/${params.dir}/...` for internal pages and navigation.
   - This can cause preview/runtime audio requests to miss the correct app base path.

3. **Consistency gap:** preview/runtime/generated preview pages do not share a single audio URL construction strategy.

---

## Options considered

1. **Fix volume only**  
   Pros: smallest code change.  
   Cons: does not solve preview silence if URLs are wrong.

2. **Fix pathing only**  
   Pros: solves broken requests if routing is the cause.  
   Cons: runtime may still be near-silent from double scaling.

3. **Combined fix (chosen)**  
   Pros: addresses confirmed runtime bug plus likely preview/runtime path mismatch; aligns all workflow audio paths.  
   Cons: slightly broader change surface.

---

## Chosen design and rationale

Implement the combined fix.

- Standardize workflow audio playback volume as a normalized `0..1` value at the app playback boundary.
- Remove the extra `/100` scaling inside `audio-player.ts`.
- Introduce a small helper for workspace-aware workflow audio asset URLs so preview/runtime and generated preview loading all use the same path rules.
- Keep the backend event pipeline unchanged unless verification proves transport is broken.

This approach fixes the confirmed volume bug and the likely pathing issue in one pass with minimal architectural churn.

---

## Scope

- Workflow runtime audio playback in the app
- Manual workflow audio preview in settings
- Internal audio preview route asset loading for generated previews if it also depends on incorrect root-relative paths
- Tests for volume normalization and URL generation behavior

---

## Out of scope

- Reworking opencode workflow audio emission logic unless the app-side fix proves insufficient
- Replacing HTMLAudio with Web Audio API
- Redesigning the Audio settings UI

---

## Technical design

- Add or extend an app-local helper in `packages/app/src/lib/audio/audio-settings.ts` to build workflow audio URLs with an optional workspace base segment.
- Update `settings-audio.tsx` to use the shared URL helper rather than hardcoded root-relative preview URLs.
- Update `audio-service.tsx` runtime playback to use the same URL helper.
- Update `audio-player.ts` to accept normalized `0..1` volume and stop dividing again.
- Review `internal/audio-preview/index.tsx` and align generated preview manifest/audio fetches if they require workspace-aware paths.
- Add tests for:
  - volume normalization (no double scaling)
  - workflow audio URL generation
  - any touched parsing/helper behavior that materially affects playback

---

## Risks and mitigations

- **Pathing assumptions differ by route:** keep URL construction centralized and test both root and workspace-prefixed cases.
- **Breaking existing desktop browser preview:** preserve existing absolute-path behavior when no workspace base is required.
- **False confidence from typecheck-only validation:** include targeted tests for helper behavior and playback volume handling.

---

## Verification plan

- Run targeted tests for audio helper/player changes in `packages/app`
- Run `bun typecheck` in `packages/app`
- Verify that preview buttons and workflow runtime share the same URL builder
- If possible, perform a lightweight browser/manual verification of the Audio settings preview and active workflow playback
