# UI Glow Polish Doctor Gate

## What it validates

Semantic presence of glow polish tokens in production codebase:

- `.aurora-bg` / `.glow-border` selectors in `packages/ui/src/styles/theme.css`
- `aurora-bg` class token in `packages/app/src/pages/layout.tsx` root container
- `@media (prefers-reduced-motion)` block exists
- Spec doc `packages/docs/implementation-ui_glow_polish.md` present

## Non-goals

- No styling changes
- No exact HTML string matching (token presence only)
- No build/performance regression checks

## Invocation

```bash
python3 tools/doctor.py
```

Passes if all tokens present. Fails fast with specific missing token.
