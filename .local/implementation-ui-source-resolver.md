# Implementation - Robust UI Source Resolver

## Problem
The current OpenCode backend only serves local UI if `config.server.uiDist` is explicitly set. Otherwise, it falls back to `app.opencode.ai`. This forces developers to use symlink hacks to trick the backend into serving their local builds or dev servers.

## Solution
Implement a `UiSourceResolver` that follows a strict priority order to determine where to load the UI from.

### Resolver Priority
1.  **CLI Flag**: `--ui-dev-url <origin>`
2.  **Config/Env**: `server.uiDevUrl` or `OPENCODE_UI_DEV_URL`
3.  **Explicit Dist**: CLI `--ui-dist` or Config `server.uiDist`
4.  **Auto-Detect**: Repo-local `packages/app/dist`
5.  **Fallback**: Hosted `app.opencode.ai`

### Architecture
- **Dev Mode**: Proxies both HTTP and WebSocket traffic. WebSocket support is critical for Vite HMR.
- **Dist Mode**: Serves static files with MIME detection and CSP protection.
- **No Hardcoding**: No default ports are assumed. Origins must be complete (e.g., `http://localhost:5173`).

### Diagnostics
The server startup dashboard will explicitly log:
- The selected UI source type.
- The path or origin being used.
- Fallback reasons if a preferred source was unreachable or missing.
