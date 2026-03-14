Implementation Plan — audit-fix/type-fix

Goal

- Resolve remaining TypeScript errors in the UI performance subsystem and stabilize SolidJS JSX typing across the monorepo.

High-level steps

1. Create a working branch audit-fix/type-fix (no commits unless requested).
2. Discover repository-wide SolidJS typings and tsconfig settings that may cause multiple JSX type resolutions.
3. Run typecheck in the UI package to capture current errors and confirm root causes.
4. Apply scoped fixes:
   - Align tsconfig JSX settings and ensure single solid-js version across workspaces
   - Convert mis-typed JSX files to .tsx where appropriate
   - Fix createStore usages and exported interfaces in performance-store/simple-performance-store
   - Replace number timer types with ReturnType<typeof setTimeout>
   - Ensure event listeners / observers store bound handlers and are removed in cleanup
   - Sanitize any innerHTML with DOMPurify (already applied to subtree-freezer — check others)
5. Re-run bun typecheck iteratively until errors for target components are zero.
6. Run security sentry audit on git diff before finalizing walkthrough.
7. Produce walkthrough.md and, if requested, open PR (no push without explicit user approval).

Notes

- I will not create commits unless you explicitly ask me to commit changes.
- I will create the working branch locally so workspace edits are isolated.
- If you want me to proceed with automated fixes after the initial discovery steps, confirm and I'll continue.

Planned immediate actions (next):

1. Create branch audit-fix/type-fix
2. Search for all package.json occurrences of solid-js and list versions
3. Find all tsconfig\*.json files and inspect jsx/jsxImportSource settings
4. Run bun typecheck in packages/ui to get current error snapshot
