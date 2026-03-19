import z from "zod"
import { Tool } from "./tool"
import path from "path"
import fs from "fs/promises"

const DESCRIPTION = `Generates an Architecture Decision Record (ADR) to document significant technical decisions. Records are saved in docs/adr/ in Markdown format.`

export const AdrTool = Tool.define("adr", {
  description: DESCRIPTION,
  parameters: z.object({
    title: z.string().describe("Short, descriptive title of the decision."),
    status: z.enum(["proposed", "accepted", "rejected", "superseded", "deprecated"]).default("proposed"),
    context: z.string().describe("Problem statement, technical constraints, and requirements."),
    decision: z.string().describe("Chosen solution with clear rationale."),
    consequences: z.object({
        positive: z.array(z.string()).describe("Beneficial outcomes (3-5 items)."),
        negative: z.array(z.string()).describe("Trade-offs and risks (3-5 items).")
    }),
    alternatives: z.array(z.object({
        name: z.string(),
        description: z.string(),
        rejection_reason: z.string()
    })).optional(),
    implementation_notes: z.array(z.string()).optional(),
    references: z.array(z.string()).optional()
  }),
  async execute(params, ctx) {
    const adrDir = path.join(process.cwd(), "docs/adr")
    await fs.mkdir(adrDir, { recursive: true })

    const date = new Date().toISOString().split('T')[0]
    const id = (await fs.readdir(adrDir)).filter(f => f.endsWith(".md")).length + 1
    const filename = `${id.toString().padStart(4, '0')}-${params.title.toLowerCase().replace(/\s+/g, '-')}.md`
    const file = path.join(adrDir, filename)

    const content = `---
title: "ADR-${id}: ${params.title}"
status: "${params.status}"
date: "${date}"
tags: ["architecture", "decision"]
---

# ADR ${id}: ${params.title}

## Status
**${params.status.charAt(0).toUpperCase() + params.status.slice(1)}**

## Context
${params.context}

## Decision
${params.decision}

## Consequences
### Positive
${params.consequences.positive.map((p, i) => `- **POS-${(i+1).toString().padStart(3, '0')}**: ${p}`).join("\n")}

### Negative
${params.consequences.negative.map((n, i) => `- **NEG-${(i+1).toString().padStart(3, '0')}**: ${n}`).join("\n")}

## Alternatives Considered
${(params.alternatives ?? []).map((alt, i) => `### ${alt.name}\n- **ALT-${(i+1).toString().padStart(3, '0')}**: **Description**: ${alt.description}\n- **ALT-${(i+1).toString().padStart(3, '0')}**: **Rejection Reason**: ${alt.rejection_reason}`).join("\n\n")}

## Implementation Notes
${(params.implementation_notes ?? []).map((note, i) => `- **IMP-${(i+1).toString().padStart(3, '0')}**: ${note}`).join("\n")}

## References
${(params.references ?? []).map((ref, i) => `- **REF-${(i+1).toString().padStart(3, '0')}**: ${ref}`).join("\n")}
`

    await fs.writeFile(file, content)

    return {
      title: "ADR Generated",
      output: `Successfully recorded ADR: **${params.title}** at ${file}`,
      metadata: { path: file, id }
    }
  }
})
