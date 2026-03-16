# Implementation: UI DevUrl vs Dist Resolver

This document defines the final behavior for local UI loading in `opencode web`.

## Goal

Remove the symlink dependency and make local UI loading work correctly in two distinct modes:

1. **Live edited UI code** through a frontend dev server
2. **Built static UI** through a local `dist` directory

The server must resolve the UI source deterministically, log the chosen source clearly, and never hardcode or guess a frontend port.

---

## Problem Statement

Current behavior causes confusion because `install --local-repo` is a **built-dist workflow**, not a **live dev UI workflow**.

That means:

- `install --local-repo` builds the frontend and points `server.uiDist` to `packages/app/dist`
- it does **not** show the latest unbuilt UI source edits
- current local UI workflows are unclear
- symlink hacks have been used as a workaround

After this change, symlink-based UI loading is considered a bug, not a workflow.

---

## UI Source Types

The resolver must return one explicit source type:

- `dev-url`
- `dist`
- `repo-dist`
- `hosted`

These types must be logged at startup.

---

## Supported UI Modes

### 1. `uiDevUrl` Mode (`dev-url`)
**Purpose:** Show the currently edited UI source code through a running frontend dev server.

**Trigger:**
- CLI: `--ui-dev-url <origin>`
- Config: `server.uiDevUrl`
- Optional env override if implemented

**Behavior:**
- Backend proxies UI HTTP requests to the provided origin
- Backend proxies WebSocket/HMR traffic to the provided origin
- Backend does not guess, infer, or hardcode any port
- The origin must be a full URL such as `http://localhost:<port>` or another valid origin

**Requirement:**
A frontend dev server must already be running separately.

**This mode is required for live UI editing.**

---

### 2. `uiDist` Mode (`dist`)
**Purpose:** Show a built local UI from an explicit dist directory.

**Trigger:**
- CLI: `--ui-dist <path>`
- Config: `server.uiDist`

**Behavior:**
- Backend serves static files from the resolved dist path
- Asset paths are served directly
- Unknown UI routes fall back to `index.html` for SPA routing

**Requirement:**
The app must already be built.

---

### 3. Auto Repo Dist Mode (`repo-dist`)
**Purpose:** Show a built local UI from the repo automatically without symlink hacks.

**Trigger:**
- No valid `uiDevUrl`
- No valid explicit `uiDist`
- Repo root is detected
- `packages/app/dist/index.html` exists

**Behavior:**
- Backend serves static files from `<repo-root>/packages/app/dist`
- SPA fallback to `index.html`
- No symlink required
- No manual dist config required if repo-local build exists

---

### 4. Hosted Fallback (`hosted`)
**Purpose:** Default fallback for users without a local UI source.

**Trigger:**
- No valid local source found

**Behavior:**
- Backend proxies UI requests to the hosted production UI

**Important:**
Hosted fallback is the final fallback only. It must never silently mask failure of an explicitly requested local source.

---

## Resolution Priority

The UI source resolver must resolve in this exact order:

1. CLI `--ui-dev-url`
2. Config/env `server.uiDevUrl`
3. CLI `--ui-dist`
4. Config `server.uiDist`
5. Auto-detected repo-local `packages/app/dist`
6. Hosted fallback

This order is mandatory.

---

## No Hardcoded Port Rule

The implementation must never:

- assume a frontend dev server port
- guess a Vite port
- inject a default frontend port automatically

All dev server origins must be provided explicitly as full URLs.

Examples of acceptable values:
- `http://localhost:<port>`
- `http://127.0.0.1:<port>`
- `http://<hostname>:<port>`

The resolver must validate the origin, but not invent one.

---

## Repo Root Detection

Auto-detection of `packages/app/dist` must use deterministic repo/workspace root discovery.

The implementation must define how repo root is found. Acceptable approaches include:
- explicit repo root resolver already used elsewhere in the codebase
- walking upward until workspace markers are found
- equivalent deterministic monorepo root discovery

Required behavior:
- **Outside Repo**: if repo root cannot be found, skip `repo-dist`. Failure to resolve repo root is not fatal; repo-dist is marked unavailable and resolution continues cleanly to the next source.
- if repo root is found but `packages/app/dist/index.html` does not exist, skip `repo-dist`
- log the reason for skipping when diagnostics are enabled

Do not depend on symlinks.

---

## `uiDevUrl` Proxy Requirements

`uiDevUrl` mode is **not complete** unless all of the following work:

- normal UI HTTP requests
- frontend assets
- HMR / live reload
- WebSocket upgrade traffic
- dev-server-specific request forwarding as needed
- **Probe Timeout**: Reachability checks for `uiDevUrl` must use a short bounded timeout (e.g., 1000ms) and must not stall startup for an excessive period.

If HMR or websocket upgrade traffic does not work, `uiDevUrl` mode is incomplete and must not be marked done.

---

## Static Dist Requirements

For both `dist` and `repo-dist` modes:

- serve asset files directly
- support SPA route fallback to `index.html`
- preserve current path traversal protection
- preserve correct MIME behavior
- preserve current security behavior unless intentionally improved

---

## Fallback Rules

If the user explicitly requested a local UI source and it fails, the server must:

1. log the source it attempted
2. log the exact failure reason
3. log the next fallback source chosen

Examples:
- invalid `--ui-dev-url`
- unreachable dev origin
- invalid `uiDist` path
- missing `index.html`
- repo root found but no `packages/app/dist`

Do not silently fall back to hosted UI.

---

## Startup Diagnostics

At startup, the server must print the chosen UI source and why it won.

Examples of the required shape:

- `UI source: dev-url`
- `UI target: <origin>`
- `Reason: CLI flag --ui-dev-url`

- `UI source: dist`
- `UI target: <absolute-path>`
- `Reason: explicit uiDist`

- `UI source: repo-dist`
- `UI target: <repo-root>/packages/app/dist`
- `Reason: auto-detected local build`

- `UI source: hosted`
- `UI target: https://app.opencode.ai`
- `Reason: no valid local UI source found`

Do not use example logs that imply a hardcoded port.

---

## `install --local-repo` Behavior

`install --local-repo` remains a **built-dist workflow**.

It must continue to:
- build the frontend
- set `server.uiDist` to the built UI directory
- support local built UI testing

It must **not** be treated as a live dev UI workflow.

For live editing, users must use `uiDevUrl`.

---

## Operator Workflows

### Live UI Editing
Use this when actively editing frontend code.

Required flow:
1. run the frontend dev server separately
2. run `opencode web --ui-dev-url <origin>`
3. backend proxies UI to that origin
4. edited UI appears immediately
5. HMR/live reload works

### Built Local UI Testing
Use this when testing the built app.

Required flow:
1. build the frontend or run `install --local-repo`
2. backend uses `uiDist` or auto-detected repo-dist
3. backend serves static built files directly

### Normal Fallback Use
Use this when no local UI source exists.

Required flow:
1. no valid local UI source is configured or found
2. backend falls back to hosted UI
3. fallback is logged clearly

---

## Required Files to Change

- `packages/opencode/src/server/server.ts`
- `packages/opencode/src/cli/cmd/web.ts`
- `packages/opencode/src/config/config.ts`
- new resolver file such as `packages/opencode/src/server/ui-source-resolver.ts`
- doctor check module
- implementation proof doc

If needed:
- `packages/opencode/src/cli/cmd/install.ts` for clarification/logging only

---

## Non-Negotiable Requirements

- `uiDevUrl` mode is not complete unless live HMR/WebSocket traffic works
- explicitly requested local UI sources must never fail silently
- auto-detected repo dist must work without symlink hacks
- no dev server port may be guessed or hardcoded
- after this change, symlink-based UI loading is considered a bug, not a workflow

---

## Verification Plan

### Test A: Live Dev UI
- start frontend dev server on a non-default arbitrary port
- run `opencode web --ui-dev-url <origin>`
- verify current edited UI code appears
- verify HMR/live reload works
- verify websocket upgrades work

### Test B: Explicit Dist
- point `--ui-dist` at a valid built dist
- verify static local UI is served
- verify SPA routes resolve correctly

### Test C: Auto Repo Dist
- ensure `<repo-root>/packages/app/dist/index.html` exists
- do not set `uiDevUrl`
- do not set explicit `uiDist`
- verify repo-dist is selected without symlink

### Test D: Invalid Dev URL
- provide invalid or unreachable `--ui-dev-url`
- verify failure is logged
- verify clean fallback to next source

### Test E: Invalid Dist
- provide invalid `--ui-dist`
- verify failure is logged
- verify clean fallback to next source

### Test F: Hosted Fallback
- remove all valid local UI sources
- verify hosted fallback is selected and logged

### Test G: No Hardcoded Port
- inspect resolver logic
- verify no guessed frontend port exists anywhere in the implementation

---

## Doctor Check Requirements

Add a dedicated doctor check and wire it into `tools/doctor.py`.

It must fail if:
- `uiDevUrl` support is missing
- resolver priority is wrong or incomplete
- repo-dist autodetect is missing
- HMR/websocket proxy support is missing in `dev-url` mode
- startup source logging is missing
- hardcoded dev server port assumptions are introduced
- old symlink dependency remains part of the intended workflow

---

## Acceptance Criteria

The feature is done only when all of the following are true:

- live edited UI code works through `uiDevUrl`
- built local UI works through `uiDist`
- built local UI also works through auto-detected repo-dist
- hosted fallback still works
- no symlink hacks are required
- no frontend port is hardcoded or guessed
- startup clearly reports the chosen UI source
- invalid local sources fail loudly and fall back cleanly
- doctor check passes
- proof from real runs is included

---

## Definition of Done

`opencode web` supports both local UI workflows correctly and without ambiguity:

- `uiDevUrl` for live edited UI code with HMR
- `uiDist` / `repo-dist` for built static UI
- hosted production UI only as final fallback

No symlink hacks. No hardcoded ports. Clear logs. Real proof.
