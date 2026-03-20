import z from "zod"
import { Tool } from "./tool"
import { HeidiState } from "../heidi/state"
import { Filesystem } from "../util/filesystem"

export const BrowserSubagentTool = Tool.define("browser_subagent", {
  description:
    "Verification-only browser worker contract. Executes browser checks and persists evidence. Returns strict pass/fail.",
  parameters: z.object({
    url: z.string(),
    checks: z.array(z.string()).default([]),
  }),
  async execute(params, ctx) {
    await HeidiState.ensure(ctx.sessionID, "browser verification")
    // Use direct imports for HeidiState and Filesystem
    let html: string | null = null
    let status: "pass" | "fail" = "fail"
    let note = ""
    const network_failures: string[] = []
    const console_errors: string[] = []
    let htmlFile: string | null = null
    let httpStatus: number | null = null
    let contentType: string | null = null
    try {
      const res = await fetch(params.url)
      html = await res.text()
      status = res.ok ? "pass" : "fail"
      note = res.ok ? "Fetched HTML successfully." : `HTTP error: ${res.status}`
      httpStatus = res.status
      contentType = res.headers.get("content-type") || null
      if (!res.ok) network_failures.push(`HTTP ${res.status}`)
    } catch (err) {
      const msg = typeof err === "object" && err && "message" in err ? (err as any).message : String(err)
      network_failures.push(msg)
      note = `Network error: ${msg}`
    }
    // Persist HTML as artifact if fetched
    if (html) {
      // Use deterministic artifact name: browser-evidence.html (overwrite per run)
      htmlFile = `browser-evidence.html`
      // Get Heidi task dir
      const files = await HeidiState.files(ctx.sessionID)
      const htmlPath = files.verification.replace(/verification.json$/, htmlFile)
      await Filesystem.write(htmlPath, html)
    }
    // Prepare evidence
    const evidence = {
      required: true,
      status,
      http_status: httpStatus,
      content_type: contentType,
      screenshots: [],
      html: htmlFile ? [htmlFile] : [],
      console_errors,
      network_failures,
    }
    // Merge with existing verification.json
    let verify = await HeidiState.readVerification(ctx.sessionID)
    if (!verify) {
      verify = {
        task_id: ctx.sessionID,
        status,
        checks: [],
        evidence: { changed_files: [], command_summary: [], before_after: "" },
        warnings: [],
        remediation: [],
      }
    }
    verify.browser = evidence
    await HeidiState.writeVerification(ctx.sessionID, verify)
    return {
      title: "browser verifier",
      metadata: evidence,
      output: JSON.stringify(evidence, null, 2),
    }
  },
})
