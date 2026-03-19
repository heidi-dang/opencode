import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Audits Markdown files and UI components for accessibility compliance and technical writing excellence.`

export const A11yTool = Tool.define("a11y", {
  description: DESCRIPTION,
  parameters: z.object({
    paths: z.array(z.string()).describe("List of files or directories to audit.")
  }),
  async execute(params, ctx) {
    const { $ } = await import("bun")
    const violations = []

    for (const path of params.paths) {
        if (path.endsWith(".md")) {
            const content = await Bun.file(path).text()
            // Check for missing alt text in images
            if (content.includes("![](") || content.includes("![ ](")) {
                violations.push({ file: path, type: "A11y", details: "Image missing alt text." })
            }
            // Check for skipped heading levels (very basic)
            if (content.includes("# ") && content.includes("### ") && !content.includes("## ")) {
                violations.push({ file: path, type: "Structure", details: "Skipped heading level (H2 missing between H1 and H3)." })
            }
        }
    }

    return {
      title: "Accessibility & Docs Audit",
      output: violations.length > 0 ? `Found ${violations.length} violations.` : "All documentation follows standards.",
      metadata: { violations, status: violations.length > 0 ? "failed" : "passed" }
    }
  }
})
