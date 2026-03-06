import { test, expect, type Page } from "./fixtures"
import { closeDialog, defocus } from "./actions"
import { modKey } from "./utils"
import {
  copilotDialogSelector,
  copilotUsageLoadingSelector,
  copilotUsageAccountSectionSelector,
  copilotUsageUsageOverviewSectionSelector,
  copilotUsageModelBreakdownSectionSelector,
  copilotUsageSessionSectionSelector,
  copilotUsageDiagnosticsSectionSelector,
  copilotUsageReducedWarningSelector,
  copilotUsageStaleWarningSelector,
  copilotUsageDiagnosticsModeSelector,
  copilotUsageAccountStatusSelector,
} from "./selectors"

const copilotUsageApiPath = "/provider/copilot/usage"

const healthyUsageData = {
  account: {
    status: "connected" as const,
    type: "personal" as const,
    plan: "pro" as const,
    reset: "2024-02-01",
    source: "api" as const,
  },
  globalUsage: {
    consumed: 1500,
    remaining: 3500,
    confidence: "exact" as const,
    lastFetch: "2024-01-15T10:00:00Z",
  },
  modelBreakdown: [
    {
      id: "gpt-4",
      name: "GPT-4",
      multiplier: 1,
      category: "included" as const,
      prompts: 100,
      premiumUnits: 0,
      tokensEst: 50000,
      confidence: "exact" as const,
    },
  ],
  sessionLocal: {
    prompts: 5,
    premiumEst: 0,
    tokensEst: 2500,
  },
  diagnostics: {
    mode: "full" as const,
    stale: false,
    missingScopes: [],
    warnings: [],
    unmappedModels: [],
  },
}

const reducedUsageData = {
  account: {
    status: "connected" as const,
    type: "org" as const,
    plan: "pro" as const,
    reset: null,
    source: "local" as const,
  },
  globalUsage: {
    consumed: 0,
    remaining: null,
    confidence: "estimated" as const,
    lastFetch: "2024-01-10T10:00:00Z",
  },
  modelBreakdown: [],
  sessionLocal: {
    prompts: 0,
    premiumEst: 0,
    tokensEst: 0,
  },
  diagnostics: {
    mode: "reduced" as const,
    stale: false,
    missingScopes: [],
    warnings: ["Reduced mode (user metrics only)"],
    unmappedModels: [],
  },
}

const staleUsageData = {
  account: {
    status: "connected" as const,
    type: "personal" as const,
    plan: "pro" as const,
    reset: "2024-02-01",
    source: "api" as const,
  },
  globalUsage: {
    consumed: 1200,
    remaining: 3800,
    confidence: "derived" as const,
    lastFetch: "2024-01-01T10:00:00Z",
  },
  modelBreakdown: [
    {
      id: "gpt-4",
      name: "GPT-4",
      multiplier: 1,
      category: "included" as const,
      prompts: 80,
      premiumUnits: 0,
      tokensEst: 40000,
      confidence: "derived" as const,
    },
  ],
  sessionLocal: {
    prompts: 3,
    premiumEst: 0,
    tokensEst: 1500,
  },
  diagnostics: {
    mode: "full" as const,
    stale: true,
    missingScopes: [],
    warnings: [],
    unmappedModels: [],
  },
}

const exhaustedUsageData = {
  account: {
    status: "connected" as const,
    type: "personal" as const,
    plan: "free" as const,
    reset: "2024-02-01",
    source: "api" as const,
  },
  globalUsage: {
    consumed: 500,
    remaining: 0,
    confidence: "exact" as const,
    lastFetch: "2024-01-15T10:00:00Z",
  },
  modelBreakdown: [
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      multiplier: 0.5,
      category: "included" as const,
      prompts: 500,
      premiumUnits: 0,
      tokensEst: 200000,
      confidence: "exact" as const,
    },
  ],
  sessionLocal: {
    prompts: 10,
    premiumEst: 0,
    tokensEst: 5000,
  },
  diagnostics: {
    mode: "full" as const,
    stale: false,
    missingScopes: [],
    warnings: ["Usage limit reached"],
    unmappedModels: [],
  },
}

const notLoggedUsageData = {
  account: {
    status: "disconnected" as const,
    type: null,
    plan: null,
    reset: null,
    source: "local" as const,
  },
  globalUsage: {
    consumed: 0,
    remaining: null,
    confidence: "estimated" as const,
    lastFetch: "2024-01-15T10:00:00Z",
  },
  modelBreakdown: [],
  sessionLocal: {
    prompts: 0,
    premiumEst: 0,
    tokensEst: 0,
  },
  diagnostics: {
    mode: "reduced" as const,
    stale: false,
    missingScopes: ["read:org"],
    warnings: ["Not logged in to GitHub Copilot"],
    unmappedModels: [],
  },
}

async function openCopilotDialog(page: Page) {
  await defocus(page)
  await page.keyboard.press(`${modKey}+K`)

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("heading", { name: "Copilot Usage" })).toBeVisible()

  return dialog
}

test.describe("copilot-toolbox", () => {
  test("shows healthy state with full data", async ({ page, gotoSession }) => {
    await gotoSession()

    await page.route(copilotUsageApiPath, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(healthyUsageData) })
    })

    const dialog = await openCopilotDialog(page)

    await expect(dialog.locator(copilotDialogSelector)).toBeVisible()
    await expect(dialog.locator(copilotUsageAccountSectionSelector)).toBeVisible()
    await expect(dialog.locator(copilotUsageUsageOverviewSectionSelector)).toBeVisible()
    await expect(dialog.locator(copilotUsageModelBreakdownSectionSelector)).toBeVisible()
    await expect(dialog.locator(copilotUsageSessionSectionSelector)).toBeVisible()
    await expect(dialog.locator(copilotUsageDiagnosticsSectionSelector)).toBeVisible()

    await expect(dialog.locator(copilotUsageAccountStatusSelector)).toHaveText("connected")
    await expect(dialog.locator(copilotUsageDiagnosticsModeSelector)).toHaveText("full")

    await expect(dialog.locator(copilotUsageReducedWarningSelector)).not.toBeVisible()
    await expect(dialog.locator(copilotUsageStaleWarningSelector)).not.toBeVisible()

    await closeDialog(page, dialog)
  })

  test("shows reduced mode warning", async ({ page, gotoSession }) => {
    await gotoSession()

    await page.route(copilotUsageApiPath, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(reducedUsageData) })
    })

    const dialog = await openCopilotDialog(page)

    await expect(dialog.locator(copilotUsageReducedWarningSelector)).toBeVisible()
    await expect(dialog.locator(copilotUsageDiagnosticsModeSelector)).toHaveText("reduced")

    await expect(dialog.locator(copilotUsageAccountSectionSelector)).toBeVisible()

    await closeDialog(page, dialog)
  })

  test("shows stale data warning", async ({ page, gotoSession }) => {
    await gotoSession()

    await page.route(copilotUsageApiPath, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(staleUsageData) })
    })

    const dialog = await openCopilotDialog(page)

    await expect(dialog.locator(copilotUsageStaleWarningSelector)).toBeVisible()

    await closeDialog(page, dialog)
  })

  test("shows exhausted usage warning", async ({ page, gotoSession }) => {
    await gotoSession()

    await page.route(copilotUsageApiPath, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(exhaustedUsageData) })
    })

    const dialog = await openCopilotDialog(page)

    await expect(dialog.locator(copilotUsageDiagnosticsSectionSelector)).toBeVisible()

    await closeDialog(page, dialog)
  })

  test("shows not logged in state", async ({ page, gotoSession }) => {
    await gotoSession()

    await page.route(copilotUsageApiPath, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(notLoggedUsageData) })
    })

    const dialog = await openCopilotDialog(page)

    await expect(dialog.locator(copilotUsageAccountStatusSelector)).toHaveText("disconnected")
    await expect(dialog.locator(copilotUsageDiagnosticsModeSelector)).toHaveText("reduced")

    await closeDialog(page, dialog)
  })

  test("shows loading state initially", async ({ page, gotoSession }) => {
    await gotoSession()

    let requestHandled = false
    await page.route(copilotUsageApiPath, async (route) => {
      if (!requestHandled) {
        requestHandled = true
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      await route.fulfill({ status: 200, body: JSON.stringify(healthyUsageData) })
    })

    await defocus(page)
    await page.keyboard.press(`${modKey}+K`)

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    await expect(dialog.locator(copilotUsageLoadingSelector)).toBeVisible()

    await expect(dialog.locator(copilotUsageAccountSectionSelector)).toBeVisible({ timeout: 10000 })

    await closeDialog(page, dialog)
  })
})
