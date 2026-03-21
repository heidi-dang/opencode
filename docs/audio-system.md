# Audio System

This repo now includes a split audio architecture built around two production paths behind one interface.

## Tool Family

Native internal tools are registered in OpenCode with these ids:

- `audio.generate`
- `audio.edit`
- `audio.layer`
- `audio.normalize`
- `audio.analyze`
- `audio.package_preview`

## Engine Split

- `sfx-engine`: deterministic, procedural, local, fast, controllable. Used for workflow cues, clicks, alerts, combo cues, and short branded sounds.
- `music-engine`: separate path for soundtrack, ambience, and loops. Current implementation is a local stub renderer with a provider slot for future backend integration.

## Package Layout

Core implementation lives in `packages/audio-tools`.

- `src/generate.ts`: variant generation and quality-selection flow
- `src/edit.ts`: AudioSpec-driven refinement
- `src/analyze.ts`: metrics extraction and waveform summaries
- `src/layer.ts`: mixdown utility
- `src/normalize.ts`: target-peak normalization
- `src/package_preview.ts`: preview payload builder
- `src/router.ts`: engine router
- `src/renderers/sfx/*`: preset-driven procedural motif system
- `src/renderers/music/*`: soundtrack/ambience stub path
- `src/scoring/*`: quality evaluator

## AudioSpec Model

The system builds strict `AudioSpec` objects with:

- mode
- cue_name
- style_family
- duration_ms
- layers
- targets
- emotion
- avoid

The SFX path uses motif layering like `micro_impact`, `glass_chord`, `low_bloom`, and `shimmer_tail` to keep a consistent family identity across cues.

## Preview UX

The internal preview route is available at `/:dir/internal/audio-preview`.

It reads `public/audio/generated/preview.json` and shows:

- playback
- waveform bars
- loudness and tail metrics
- quality score
- version history
- one-click tweak payloads for `audio.edit`

## Routing

Heidi now has a dedicated `audio-specialist` subagent for sound requests. Audio tasks should route there instead of being handled as generic coding work.

## Phase Notes

- Phase 1 is production-ready for deterministic SFX generation and preview packaging.
- Phase 2 is scaffolded with the separate music/ambience engine path and provider stub.
- Phase 3 can extend the same architecture into pack-wide generation and family-level evaluation.
