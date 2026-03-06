# UI Glow Polish Specification

## Overview

P0 implementation layer for opencode-heidi. Applies subtle glow effects, aurora background, and refined motion to elevate perceived quality. All effects use theme tokens. No canvas rendering. CSS transforms/animations only.

## 1. Glow Application

### Panels

```
.panel {
  box-shadow:
    0 0 0 1px rgba(var(--color-surface-600-rgb), 0.5),
    0 4px 12px -4px rgba(var(--color-primary-500-rgb), 0.15),
    inset 0 1px 0 rgba(var(--color-surface-100-rgb), 0.3);
}
```

### Inputs

```
input:focus,
textarea:focus,
select:focus {
  box-shadow:
    0 0 0 3px rgba(var(--color-primary-500-rgb), 0.15),
    0 0 0 1px var(--color-primary-500),
    0 2px 8px rgba(var(--color-primary-500-rgb), 0.2);
  outline: none;
  border-color: var(--color-primary-500);
}
```

### Focused Elements

```
*:focus-visible {
  box-shadow:
    0 0 0 3px rgba(var(--color-accent-500-rgb), 0.2),
    0 0 0 1px var(--color-accent-500);
}
```

### Active Tabs

```
.tab[aria-selected="true"] {
  box-shadow:
    0 -4px 12px rgba(var(--color-accent-500-rgb), 0.25),
    inset 0 1px 0 rgba(var(--color-accent-500-rgb), 0.3);
}
```

### Selected Items

```
.list-item[aria-selected="true"] {
  box-shadow:
    inset 4px 0 var(--color-primary-500),
    0 2px 8px rgba(var(--color-primary-500-rgb), 0.15);
}
```

## 2. Aurora Gradient (Background Only)

App-level background. Ensures text readability with surface layering.

```
.app {
  background:
    radial-gradient(ellipse at top left, rgba(var(--color-accent-500-rgb), 0.04) 0%, transparent 50%),
    radial-gradient(ellipse at bottom right, rgba(var(--color-primary-500-rgb), 0.03) 0%, transparent 50%),
    linear-gradient(135deg,
      rgba(var(--color-surface-900-rgb), 0.94) 0%,
      rgba(var(--color-surface-950-rgb), 0.97) 50%,
      rgba(var(--color-surface-900-rgb), 0.94) 100%
    );
}
```

**Readability Guarantee**: All content sits on `--color-surface` or `--color-surface-50` with sufficient contrast ratio (4.5:1 minimum).

## 3. Motion System

### Default Animations

```
@keyframes glowPulse {
  0%, 100% { box-shadow: var(--glow-default); }
  50% { box-shadow: var(--glow-pulse); }
}

@keyframes auroraShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
```

### Reduced Motion Support

```
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 4. Performance Requirements

- ✅ CSS `transform`, `opacity` only for animations
- ✅ `will-change: transform` on animated elements
- ✅ `contain: layout style paint` on panels
- ❌ No `canvas`, WebGL, or particle systems
- ❌ No JavaScript-driven animations
- ✅ GPU-accelerated properties only
- ✅ 60fps target on mid-range hardware

## 5. Theme Token Integration

### Required Tokens

```
--color-primary-500
--color-accent-500
--color-surface-900
--color-surface-950
--color-surface-600
--color-surface-100
--color-surface

--color-primary-500-rgb  /* space-separated RGB values */
--color-accent-500-rgb
--color-surface-*-rgb
```

### CSS Custom Properties (Glow States)

```
:root {
  --glow-default: 0 0 0 1px rgba(var(--color-surface-600-rgb), 0.5), 0 4px 12px -4px rgba(var(--color-primary-500-rgb), 0.15);
  --glow-pulse: 0 0 0 1px rgba(var(--color-primary-500-rgb), 0.3), 0 8px 24px -8px rgba(var(--color-primary-500-rgb), 0.25);
  --glow-focus: 0 0 0 3px rgba(var(--color-accent-500-rgb), 0.2), 0 0 0 1px var(--color-accent-500);
}
```

### Dark/Light Mode

Effects auto-adapt via theme token values. No mode-specific overrides needed.

## Implementation Priority

1. Aurora background (app root)
2. Panel glows
3. Input focus states
4. Tab/selection glows
5. Motion system + reduced-motion
6. Performance optimizations

## Verification Checklist

- [ ] All glows use theme tokens
- [ ] Background maintains 4.5:1 contrast
- [ ] `@media (prefers-reduced-motion)` disables all motion
- [ ] `performance.now()` shows <16ms frame times
- [ ] No `requestAnimationFrame` loops
