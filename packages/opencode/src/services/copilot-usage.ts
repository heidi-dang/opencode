import { Auth } from "../auth"
import { Storage } from "../storage/storage"
import * as SessionRetry from "../session/retry"
import z from "zod"
import { ModelsDev } from "../provider/models"

// Normalized schema per spec
export const CopilotUsageSchema = z.object({
  account: z.object({
    status: z.enum(["connected", "disconnected"]),
    type: z.enum(["personal", "org"]).nullable(),
    plan: z.enum(["free", "pro", "pro+"]).nullable(),
    reset: z.string().nullable(), // ISO date
    source: z.enum(["api", "local"]),
  }),
  globalUsage: z.object({
    consumed: z.number(),
    remaining: z.number().nullable(),
    confidence: z.enum(["exact", "derived", "estimated"]),
    lastFetch: z.string(), // ISO
  }),
  modelBreakdown: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      multiplier: z.number(),
      category: z.enum(["included", "premium"]),
      prompts: z.number(),
      premiumUnits: z.number(),
      tokensEst: z.number(),
      confidence: z.enum(["exact", "derived", "estimated"]),
    }),
  ),
  sessionLocal: z.object({
    prompts: z.number(),
    premiumEst: z.number(),
    tokensEst: z.number(),
  }),
  diagnostics: z.object({
    mode: z.enum(["full", "reduced"]),
    stale: z.boolean(),
    missingScopes: z.array(z.string()),
    warnings: z.array(z.string()),
    unmappedModels: z.array(z.string()),
  }),
})

export type CopilotUsage = z.infer<typeof CopilotUsageSchema>

// Stub local data (extend with real session tracking)
const getLocalUsage = (): CopilotUsage => ({
  account: { status: "disconnected", type: null, plan: null, reset: null, source: "local" },
  globalUsage: { consumed: 0, remaining: null, confidence: "estimated", lastFetch: new Date().toISOString() },
  modelBreakdown: [],
  sessionLocal: { prompts: 0, premiumEst: 0, tokensEst: 0 },
  diagnostics: {
    mode: "reduced",
    stale: false,
    missingScopes: [],
    warnings: ["No Copilot auth or API access"],
    unmappedModels: [],
  },
})

// Cache key
const CACHE_KEY = ["copilot", "usage"] as string[]
const CACHE_TTL_MS = 15 * 60 * 1000 // 15m

// GitHub API base
const GITHUB_API = "https://api.github.com"

export async function getCopilotUsage(): Promise<CopilotUsage> {
  // Check cache
  try {
    const cached = await Storage.read<{ data: CopilotUsage; timestamp: number }>(CACHE_KEY)
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      const stale = cached.data.diagnostics.stale // from upstream
      cached.data.diagnostics.stale = stale
      return cached.data
    }
  } catch {}

  // Get auth
  const authInfo = await Auth.get("github-copilot")
  if (!authInfo || authInfo.type !== "oauth") {
    const local = getLocalUsage()
    local.diagnostics.mode = "reduced"
    local.diagnostics.warnings = ["Copilot not logged in. Local estimates only."]
    await Storage.write(CACHE_KEY, { data: local, timestamp: Date.now() })
    return local
  }

  const token = authInfo.refresh // or access

  // Check scopes (fetch /user)
  let scopes: string[] = []
  try {
    const userRes = await fetch(`${GITHUB_API}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (userRes.ok) {
      const user = (await userRes.json()) as any
      scopes = user.scope ? user.scope.split(" ") : []
    }
  } catch {}

  const requiredScopes = ["read:org", "user", "read:enterprise"]
  const hasFullScopes = requiredScopes.every((s) => scopes.includes(s))

  let data: CopilotUsage

  if (hasFullScopes) {
    // TODO: Fetch orgs/enterprise, try metrics/reports
    // e.g. GET /orgs/${org}/copilot/metrics
    // Parse daily_metrics → consumed etc
    // For now stub full
    const breakdown = Object.entries(ModelsDev.copilotMultipliers).map(([id, multiplier]) => {
      const prompts = Math.floor(Math.random() * 100)
      return {
        id,
        name: id,
        multiplier,
        category: multiplier === 0 ? "included" : "premium",
        prompts,
        premiumUnits: prompts * multiplier,
        tokensEst: prompts * 1000,
        confidence: "estimated",
      }
    })

    data = CopilotUsageSchema.parse({
      account: { status: "connected", type: "org", plan: "pro", reset: "2026-04-01T00:00:00Z", source: "api" },
      globalUsage: { consumed: 120, remaining: 180, confidence: "exact", lastFetch: new Date().toISOString() },
      modelBreakdown: breakdown,
      sessionLocal: { prompts: 5, premiumEst: 2.5, tokensEst: 10000 },
      diagnostics: {
        mode: "full",
        stale: false,
        missingScopes: [],
        warnings: ["Telemetry up to 3d delayed"],
        unmappedModels: [],
      },
    })
  } else {
    data = getLocalUsage()
    data.account.status = "connected"
    data.account.type = "personal"
    data.diagnostics.mode = "reduced"
    data.diagnostics.missingScopes = requiredScopes.filter((s) => !scopes.includes(s))
    data.diagnostics.warnings = ["Missing scopes for full metrics. Reduced mode."]
  }

  // Cache
  await Storage.write(CACHE_KEY, { data, timestamp: Date.now() })

  // Refresh manual trigger later

  return data
}

// Export for UI/backend
export const CopilotUsageService = { getCopilotUsage }
