# UI Glow Polish Specification

## Glow Application Rules

Glow effects enhance interactivity and visual hierarchy. Apply only to these elements:

- **Panels**: Subtle outer glow on hover/focus for container cards, sidebars, and modal backgrounds
- **Inputs**: Focus ring replaced with inner/outer glow using `--glow-primary`
- **Active Tabs**: Glow underline or border glow on selected tab state
- **Selected Items**: List/tree selections get `--glow-selection` glow

Never apply glow to static text, icons, or non-interactive surfaces.

## Aurora Gradient Rules

Aurora provides subtle environmental animation:

- **App Background Only**: Full viewport or main container using `--aurora-start` to `--aurora-end`
- **Readability Priority**: Ensure 4.5:1 contrast ratio against foreground content at all times
- **Layering**: Always behind content layers (z-index: -1)
- **No Overlap**: Never use on panels, cards, or surfaces that hold text

## Motion Guidelines

Respect user motion preferences:

```
@media (prefers-reduced-motion: reduce) {
  .aurora { animation: none; }
  .glow-hover { transition: none; }
}
```

- Aurora: Static gradient fill
- Glow: Instant state change, no easing
- Hover effects: Snap transitions only if motion allowed

## Performance Requirements

Pure CSS implementation:

- CSS `box-shadow` for glow (multi-layered for depth)
- CSS `linear-gradient()` + `background-position` keyframes for aurora
- `filter: drop-shadow()` fallback where `box-shadow` insufficient
- No canvas, WebGL, or JavaScript animation loops
- Target 60fps on mid-range hardware
- Sub-16ms paint time per frame

## Theme Token References

```
--glow-primary: #a8c0ff26
--glow-selection: #7dd3fc33
--glow-input-focus: #06b6d41a
--aurora-start: linear-gradient(45deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)
--aurora-end: linear-gradient(45deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)
--glow-intensity-low: 0 0 4px
--glow-intensity-med: 0 0 8px
--glow-intensity-high: 0 0 16px
```

## Implementation Priority

1. Background aurora (P0)
2. Input focus glow (P0)
3. Panel hover glow (P1)
4. Tab/selection glow (P1)
