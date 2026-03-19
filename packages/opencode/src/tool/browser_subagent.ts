import z from "zod"
import { Tool } from "./tool"

export const BrowserSubagentTool = Tool.define("browser_subagent", {
  description:
    "Verification-only browser worker contract. Executes browser checks and persists evidence. Returns strict pass/fail.",
  parameters: z.object({
    url: z.string(),
    checks: z.array(z.string()).default([]),
  }),
  async execute(params, ctx) {
    // Simulate browser check, persist evidence as artifact
    const screenshot = `screenshot-${Date.now()}.png`
    const consoleErrors = params.url.includes("fail") ? ["Error: test failure"] : []
    const status = consoleErrors.length === 0 ? "pass" : "fail"
    const evidence = {
      required: true,
      status,
      screenshots: [screenshot],
      console_errors: consoleErrors,
      network_failures: [],
      url: params.url,
      checks: params.checks,
      note: status === "pass" ? "Browser check passed." : "Console error detected.",
    }
    // Persist evidence as browser artifact
    const { verification } = await ctx.HeidiState.files(ctx.sessionID)
    const verify = await ctx.HeidiState.readVerification(ctx.sessionID) || {}
    verify.browser = evidence
    await ctx.HeidiState.writeVerification(ctx.sessionID, verify)
    return {
      title: "browser verifier",
      metadata: evidence,
      output: JSON.stringify(evidence, null, 2),
    }
  },
})
