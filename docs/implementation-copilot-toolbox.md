# Implementation Plan: Copilot Toolbox

## Auth Reuse Path

- Storage: `~/.local/share/opencode/auth.json` via `packages/opencode/src/auth/index.ts` Auth.get/set(\"github-copilot\") → {access_token, refresh_token, expires_at}
- Flow: `plugin/copilot.ts` device OAuth (scopes: read:user), Bearer ${refresh || access}
- Backend hook: Auth.get('github-copilot') in service, check scopes ['read:org','user','read:enterprise'] → fallback if missing
- Multi-account: per-accountId in auth.json/session.actor

## Frontend Injection Point

**Note**: No 'Model' tab found in sidebar (sidebar-shell.tsx icons: projects/settings/help). Models in settings-models.tsx/dialog-select-model.tsx.
**Proposal**: Add Copilot icon/tab in sidebar-shell.tsx icons array after settings-gear:

```tsx
// sidebar-shell.tsx ~line 82
{icon: 'copilot', label: 'Copilot', onClick: () => setActiveTab('copilot'), component: CopilotPanel}
```

Alternative: settings-models.tsx sub-section 'Copilot Usage'.

## Backend Data Sources

**Source A (Primary)**: GitHub REST Copilot metrics

- Legacy (deprec 2026): GET /orgs/{org}/copilot/metrics (read:org), /enterprises/{}/copilot/metrics (read:enterprise)
- New: GET /enterprises/{}/copilot/metrics/reports/enterprise-1-day (NDJSON/CSV download, View Copilot metrics role)
- No personal /user/copilot/usage confirmed; fallback local
- Headers: x-ratelimit-remaining/reset, 24h telemetry delay
  **Source B (Fallback)**: Local OpenCode session (prompts/models/tokens from session/llm.ts)

## Normalized Schema (TypeScript interface)

```ts
interface CopilotUsage {
  account: {
    status: "connected" | "disconnected"
    type: "personal" | "org"
    plan: "free" | "pro" | "pro+" | null
    reset: Date | null
    source: "api" | "local"
  }
  globalUsage: {
    consumed: number
    remaining: number | null
    confidence: "exact" | "derived" | "estimated"
    lastFetch: Date
  }
  modelBreakdown: Array<{
    id: string
    name: string
    multiplier: number
    category: "included" | "premium"
    prompts: number
    premiumUnits: number
    tokensEst: number
    confidence: string
  }>
  sessionLocal: { prompts: number; premiumEst: number; tokensEst: number }
  diagnostics: {
    mode: "full" | "reduced"
    stale: boolean
    missingScopes: string[]
    warnings: string[]
    unmappedModels: string[]
  }
}
```

## Model Catalog (data-driven, extend provider/models.ts)

```ts
const copilotModels = {
  "gpt-4.1": { name: "GPT-4.1", family: "OpenAI", multiplier: 0, included: true, autoDiscount: false },
  "gpt-5-mini": { multiplier: 0, included: true },
  "grok-code-fast-1": { multiplier: 0.25 },
  "claude-haiku-4.5": { multiplier: 0.33 },
  "claude-sonnet-4.5": { multiplier: 1 },
  "gpt-5.2-codex": { multiplier: 1 },
  "claude-opus-4.6": { multiplier: 3 },
  // tokenEstPolicy: local prompt/response len * factor
}
```

Plans: Free=50, Pro=300, Pro+=1500 premium units/mo, reset 1st 00:00 UTC, overage $0.04/unit. Auto 10% discount.

## Estimation Rules

- Premium units = sum(model.premiumUnits = prompts \* multiplier)
- Tokens est = local prompt+response len (label 'estimated token equivalents')
- Remaining = allowance - consumed (if plan known, else null)
- Confidence: 'exact'(API), 'derived'(plan known), 'estimated'(local)

## Refresh/Backoff Policy

- Cache: ~/.local/share/opencode/copilot-usage.json (storage.ts), TTL 15m (timestamp check)
- Fetch: on tab open + manual btn (cooldown 1m), visibility poll 30m
- Backoff: retry.ts exp (2s base x2), respect Retry-After/x-ratelimit-reset
- Error: 429/5xx backoff, scopes miss → reduced mode

## Error States / Reduced Mode

- No token: 'Not logged in - Local estimates only'
- No scopes/perms: 'Reduced mode (user metrics only)'
- Stale (>3d telemetry + >15m cache): 'Stale data (up to 3d delay)'
- Exhausted: 'Premium exhausted. Included models (GPT-4.1/GPT-5 mini) only.'
- No telemetry: 'No telemetry - enable IDE reporting?'

## Files to Change

1. docs/implementation-copilot-toolbox.md (this)
2. packages/opencode/src/services/copilot-usage.ts (new service)
3. packages/opencode/src/provider/models.ts (+catalog)
4. packages/opencode/src/session/llm.ts (+local tracking)
5. packages/app/src/components/sidebar-shell.tsx (+Copilot icon/tab)
6. packages/app/src/components/copilot-panel.tsx (new, 5 sections)
7. tools/doctor.py (+check_copilot_toolbox)
8. packages/app/e2e/copilot-toolbox.spec.ts (new tests)
9. packages/opencode/test/services/copilot-usage.test.ts (unit)
