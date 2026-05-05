import { Tool } from "./tool"
import z from "zod"
import { spawn } from "child_process"
import { Instance } from "../project/instance"
import path from "path"
import fs from "fs/promises"

const parameters = z.object({
  url: z.string().describe("The local or remote URL to test with Lighthouse."),
})

export const LighthouseTool = Tool.define("lighthouse_audit", {
  description: "Programmatically runs a headless Chrome performance trace on a given URL and feeds LCP/CLS metrics back.",
  parameters,
  async execute(params, ctx) {
    const cwd = Instance.worktree
    const report = path.join(cwd, "lh-report.json")

    return new Promise<{ title: string; output: string; metadata: any }>((resolve) => {
      const cmd = `npx --yes lighthouse ${params.url} --quiet --output=json --output-path=${report} --chrome-flags="--headless"`
      
      const proc = spawn(cmd, { shell: true, cwd })
      let stderr = ""

      proc.stderr?.on("data", (data) => (stderr += data.toString()))

      proc.on("close", async (code) => {
        try {
          const data = await fs.readFile(report, "utf8")
          const json = JSON.parse(data)
          
          const lcp = json.audits['largest-contentful-paint']?.displayValue
          const cls = json.audits['cumulative-layout-shift']?.displayValue
          const fcp = json.audits['first-contentful-paint']?.displayValue
          const tti = json.audits['interactive']?.displayValue
          
          // Clean up
          await fs.unlink(report).catch(() => {})
          
          resolve({ 
            title: "Lighthouse Trace", 
            output: `Lighthouse Audit Complete for ${params.url}:\n- LCP: ${lcp}\n- CLS: ${cls}\n- FCP: ${fcp}\n- TTI: ${tti}\n\nReview these metrics to optimize web lifecycles.`, 
            metadata: {} 
          })
        } catch (e) {
          resolve({ 
            title: "Lighthouse Trace", 
            output: `Lighthouse failed or report unreadable. Stderr: ${stderr.slice(0, 500)}`, 
            metadata: {} 
          })
        }
      })
    })
  },
})
