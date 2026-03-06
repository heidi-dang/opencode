# Dependency Audit - OpenCode Fork

## Workspace Inventory

| Package          | Path                      | Classification | Notes                                         |
| ---------------- | ------------------------- | -------------- | --------------------------------------------- |
| opencode         | packages/opencode         | **REQUIRED**   | Core CLI tool                                 |
| app              | packages/app              | **REQUIRED**   | Web UI                                        |
| web              | packages/web              | **REQUIRED**   | Documentation site                            |
| ui               | packages/ui               | **REQUIRED**   | UI components                                 |
| util             | packages/util             | **REQUIRED**   | Shared utilities                              |
| plugin           | packages/plugin           | **REQUIRED**   | Plugin system                                 |
| script           | packages/script           | **REQUIRED**   | Script runner                                 |
| function         | packages/function         | **REQUIRED**   | Serverless functions                          |
| sdk              | packages/sdk/js           | **REQUIRED**   | JS SDK                                        |
| console-app      | packages/console/app      | OPTIONAL       | Console UI (SST)                              |
| console-core     | packages/console/core     | OPTIONAL       | Console backend (SST)                         |
| console-function | packages/console/function | OPTIONAL       | Console functions (SST)                       |
| console-mail     | packages/console/mail     | OPTIONAL       | Console mail (SST)                            |
| console-resource | packages/console/resource | OPTIONAL       | Console resource (SST)                        |
| **enterprise**   | packages/enterprise       | **REMOVE**     | Enterprise tier - not used in default runtime |
| desktop          | packages/desktop          | DEV-ONLY       | Tauri desktop app                             |
| desktop-electron | packages/desktop-electron | DEV-ONLY       | Electron desktop app                          |
| storybook        | packages/storybook        | DEV-ONLY       | Component storybook                           |
| slack            | packages/slack            | OPTIONAL       | Slack integration                             |

## Rationale

### REQUIRED

- Core packages needed for default `npm run dev` (opencode CLI) and web UI (app).

### OPTIONAL

- Console packages: SST-based, deployable separately, not in default install
- Slack: Optional integration, not required for core functionality

### DEV-ONLY

- Desktop apps: Not needed for core development
- Storybook: Development-time component explorer only

### REMOVE

- **enterprise**: Not imported by any core package, purely enterprise tier functionality

## Heavy Package Status

Default install (`bun install`) still installs all workspaces due to monorepo structure. The following are made opt-in:

| Script          | Target             | Status      |
| --------------- | ------------------ | ----------- |
| `dev`           | packages/opencode  | ✅ Default  |
| `dev:web`       | packages/app       | ✅ Explicit |
| `dev:desktop`   | packages/desktop   | ✅ Explicit |
| `dev:storybook` | packages/storybook | ✅ Explicit |

## Action Items

1. ✅ Remove packages/enterprise entirely
2. ✅ Update root workspace list
3. ✅ Ensure default scripts only touch core packages
4. ✅ Add doctor check to prevent enterprise re-addition
