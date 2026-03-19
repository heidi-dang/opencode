import z from "zod"
import { Tool } from "./tool"
import path from "path"
import fs from "fs/promises"

const DESCRIPTION = `Generates an Architecture Decision Record (ADR) to document significant technical decisions. Records are saved in docs/adr/ in Markdown format.`

export const AdrTool = Tool.define("adr", {
  description: DESCRIPTION,
  parameters: z.object({
    title: z.string().describe("Short, descriptive title of the decision."),
    status: z.enum(["proposed", "accepted", "deprecated", "superseded"]).default("proposed"),
    context: z.string().describe("What is the issue that we're seeing?"),
    decision: z.string().describe("What is the proposed change?"),
    consequences: z.string().describe("What is the impact of this change?")
  }),
  async execute(params, ctx) {
    const adrDir = path.join(process.cwd(), "docs/adr")
    await fs.mkdir(adrDir, { recursive: true })

    const date = new Date().toISOString().split('T')[0]
    const id = (await fs.readdir(adrDir)).filter(f => f.endsWith(".md")).length + 1
    const filename = `${id.toString().padStart(4, '0')}-${params.title.toLowerCase().replace(/\s+/g, '-')}.md`
    const file = path.join(adrDir, filename)

    const content = `# ADR ${id}: ${params.title}\n\n- Date: ${date}\n- Status: ${params.status}\n\n## Context\n${params.context}\n\n## Decision\n${params.decision}\n\n## Consequences\n${params.consequences}\n`

    await fs.writeFile(file, content)

    return {
      title: "ADR Generated",
      output: `Successfully recorded ADR: **${params.title}** at ${file}`,
      metadata: { path: file, id }
    }
  }
})
