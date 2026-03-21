# Mobile Session Review Redesign

A simplified, responsive changes view for mobile session reviews.

---

## Problem statement

The current session review page is non-functional on mobile because it reuses the desktop diff review UI, which is heavy and not well suited to narrow screens. This causes blank or non-responsive rendering in the mobile Changes tab.

---

## Current architecture summary

- `packages/app/src/pages/session.tsx` owns the mobile Session/Changes tab switch.
- On mobile, the Changes tab currently renders `reviewContent(...)` as `mobileFallback` inside `MessageTimeline`.
- `reviewContent(...)` renders `SessionReviewTab`.
- `SessionReviewTab` wraps `@opencode-ai/ui/session-review`, which is a desktop-oriented accordion diff UI with rich review controls.

---

## Options considered with trade-offs

1. **Adapt the existing desktop review UI for mobile**  
   Pros: one component path.  
   Cons: high risk, complex responsive fixes, still heavy on phones.

2. **Introduce a dedicated mobile review summary view**  
   Pros: simple, reliable, responsive, small scope.  
   Cons: mobile gets a reduced feature set versus desktop.

3. **Hide review on mobile and show a fallback message**  
   Pros: lowest implementation risk.  
   Cons: removes important functionality for mobile users.

---

## Chosen design and rationale

Choose option 2. Mobile should render a lightweight summary list of changed files/cards instead of the full desktop diff surface. Desktop review stays unchanged. This directly addresses the blank layout while minimizing regression risk.

---

## Scope

- Replace the mobile Changes-tab review surface only.
- Show a compact mobile list of changed files based on existing diff data.
- Allow users to tap into the real file view using the existing open-file callback.
- Preserve current loading and empty states in a mobile-friendly format.

---

## Out of scope

- Changing desktop review behavior.
- Reworking diff fetching or backend session data.
- Adding mobile inline diff comments, split/unified toggles, or advanced review controls.

---

## UX details for the mobile changes view

- Keep the current mobile `Session / Changes` top tabs.
- In `Changes`, render a vertically scrollable list of cards.
- Each card shows:
  - filename
  - parent path when relevant
  - change status and additions/deletions
  - a primary action to open the file
- Show a simple loading message while diffs load.
- Show a compact empty state when there are no changes.
- Avoid the desktop accordion, diff toolbar, and complex sticky review layout on mobile.

---

## Technical design

- Add a new lightweight component under `packages/app/src/pages/session/` (not `packages/ui`) so it can reuse app session helpers and callbacks directly.
- Update `packages/app/src/pages/session.tsx` so the mobile `Changes` fallback renders the new mobile component instead of `reviewContent(...)`.
- Keep `packages/app/src/pages/session/review-tab.tsx` and `packages/ui/src/components/session-review.tsx` desktop-only.
- Pass existing diff data (`reviewDiffs()`), loading state, empty state, and `openReviewFile` callback into the mobile component.
- Prefer a summary card list over any inline diff renderer.

---

## Risks and mitigations

- **Reduced mobile feature parity:** acceptable trade-off; users can still inspect the file itself after opening it.
- **State divergence between mobile and desktop:** keep the mobile component narrow and reuse the same selectors/callbacks.
- **Loading edge cases:** explicitly handle `diffsReady()` and empty review state.
- **Regression risk:** do not modify the desktop review path.

---

## Verification plan

- Confirm the mobile Changes tab no longer renders blank.
- Confirm cards fit and scroll on narrow screens.
- Confirm tapping a card opens the file through the existing review/file flow.
- Confirm loading and empty states render correctly on mobile.
- Confirm desktop review remains unchanged.
- Run `bun typecheck` from `packages/app` and targeted tests covering the new mobile component.
