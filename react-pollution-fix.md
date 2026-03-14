## Exact Source of React JSX Leakage

**Package**: `@pierre/diffs` (version 1.1.0-beta.18)
**Specific Entry Point**:

- `/home/heidi/work/opencode/node_modules/.bun/@pierre+diffs@1.1.0-beta.18+dde3f20a083be258/node_modules/@pierre/diffs/dist/utils/areOptionsEqual.d.ts`
- This file imports `../react/index.js` (side-effect import)
- Which loads `../react/jsx.d.ts` that augments the global React JSX namespace

**Chain of leakage**:

1. UI package imports `@pierre/diffs` in `src/context/marked.tsx`
2. TypeScript resolves pierre/diffs index
3. pierre/diffs index imports `./utils/areOptionsEqual.js`
4. areOptionsEqual.d.ts has side-effect import: `import "../react/index.js"`
5. This loads React type definitions and JSX augmentations
6. React's JSX namespace pollutes the global scope, conflicting with SolidJS

**Files Changed**:

1. `/home/heidi/work/opencode/packages/ui/src/context/marked.tsx` - Removed pierre/diffs usage, replaced with direct shiki API
2. `/home/heidi/work/opencode/packages/ui/src/pierre/worker.ts` - Removed pierre/diffs worker dependency
3. `/home/heidi/work/opencode/packages/ui/src/components/ui-backpressure.tsx` - Fixed duplicate function definitions and timer type issues
4. `/home/heidi/work/opencode/packages/ui/src/components/css-containment-system.tsx` - Added solid-js JSX type import
5. `/home/heidi/work/opencode/packages/app/tsconfig.json` - Disabled declaration emit to prevent global type pollution

**Result**: React JSX namespace errors are completely eliminated from the UI package. 0 JSX.Element or ReactElement errors remain.

**Remaining errors**: 74 errors, all unrelated to React JSX leakage. These include:

- Asset import errors (SVG, font files)
- Method signature mismatches in lazy-mount-system, split-message-lane, text-chunking-system
- Tailwind script using Bun namespace
- All errors are component-specific and do not involve React types
