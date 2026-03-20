# Thinking Card Mobile Polish Implementation

## Final card structure

The thinking theater card now uses a strict four-row structure in `packages/ui/src/components/thinking-theater.tsx`:

1. **Row 1 (title):** shimmer title in `data-slot="theater-title"`
2. **Row 2 (subtitle):** supporting text in `data-slot="theater-subtext"`
3. **Row 3 (chips):** dedicated chip row in `data-slot="theater-chips"`
4. **Row 4 (optional):** live strip in `data-slot="theater-strip"`

The orb remains in a dedicated left lane (`data-slot="theater-orb"`) while all text and chips stay in the main column (`data-slot="theater-main"`).

## Responsive chip row behavior

- Chips are always rendered below subtitle content (never inline with subtitle).
- On narrow mobile (`max-width: 430px`), chip output is collapsed to a bounded list with an overflow token: `+N more`.
- Chip labels are truncated with ellipsis to avoid forcing narrow text stacks.
- Small-screen CSS keeps the chip row to two visual lines via height clamp.

## Orb states and motion rules

`HeidiOrb` now renders a **Chibi Heidi** identity with plate, aura, glossy core, face, cheeks, and shine.

Supported visual states:

- `idle`
- `thinking`
- `focused`
- `verifying`
- `success`
- `warning`

Compatibility states are also handled (`planning`, `editing`, `testing`, `blocked`) for existing runtime mappings.

Motion mapping:

- **idle:** soft breathing, low aura
- **thinking:** breathing + blink + halo pulse
- **focused:** tighter ring and intent expression
- **verifying:** brighter cleaner ring and composed face
- **success:** short bloom pulse then calm breathing
- **warning:** gentle amber shimmer, non-harsh

Success now includes a subtle **relief micro-transition**:

- mouth animates from tighter serious line into a soft smile
- cheek glow gently returns
- shine briefly brightens then settles

This creates a hard→cute emotional release after intense states.

Relief timing is unified with orb-local motion tokens:

- `--orb-relief-time: 400ms`
- `--orb-relief-ease: cubic-bezier(0.16, 1, 0.3, 1)`

This keeps mouth/cheek/shine transitions synchronized for a cleaner premium finish.

State-to-state continuity is now tiered:

- `soft` relief: normal -> success (shorter, gentle)
- `mid` relief: focused/verifying/testing -> success (clear release)
- `deep` relief: warning/blocked -> success (longer decompression)

The tier is computed from the immediately previous phase and surfaced via `data-relief`.

Designer tuning pass adjusted relief pacing for snappier premium feel:

- soft: `300ms`
- mid: `380ms`
- deep: `460ms`

### Emotional adaptation (cute ↔ serious)

The orb now has a mood layer controlled by `data-mood`:

- `cute` (default/normal): visible cheeks, softer smile, friendlier expression
- `hard` (intense states): reduced cheek glow, tighter mouth, more intent eyes
- `hardest` (critical states): near-neutral face, minimal cute cues, strongest focus posture

Hard mode is used for:

- `focused`
- `verifying`
- `testing`

Hardest mode is used for:

- `warning`
- `blocked`

This keeps Heidi expressive without becoming noisy or childish during heavy work.

## Mobile constraints

- Card inner padding tuned to mobile-safe values (`14px` horizontal, `15px` compact variant).
- Subtitle to chip row spacing kept in the `8–12px` rhythm (`gap` + small margin).
- Chip row gap set to `8px`.
- Orb/title and subtitle align in one text column via `theater-main`.

## Known fallback behavior

- If viewport detection is unavailable (SSR), full chip list is used until client hydration.
- Existing non-required phases map to nearest compatible visual behavior to avoid regressions.
- Overflow token uses plain text format `+N more` for deterministic rendering.
