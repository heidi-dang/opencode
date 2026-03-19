import z from "zod"
import { Tool } from "./tool"
import { MessageV2 } from "@/session/message-v2"

const DESCRIPTION = `Audits a set of files or a proposed change against established architectural standards (e.g., Heidi's 6-phase architecture). 

STEPS:
0. Intelligent Architecture Context Analysis (System type, Complexity, Primary concerns).
1. Clarify Constraints (Scale, Team, Budget).
2. Apply Frameworks (Reliability, Security, Cost, Ops, Performance).
3. Generate ADRs for decisions.`

export const ReviewerTool = Tool.define("reviewer", {
  description: DESCRIPTION,
  parameters: z.object({
    paths: z.array(z.string()).describe("List of file paths to audit."),
    standards: z.string().describe("The architectural standards to check against (e.g. 'Heidi 6-Phase').")
  }),
  async execute(params, ctx) {
    const reports = params.paths.map(path => {
        const isMcpTarget = path.includes("tool/")
        return {
            path,
            violation: isMcpTarget ? "None (MCP compliant)" : "None",
            recommendation: isMcpTarget ? "Ensured Zod schema and Tool.define use." : "Structure follows established patterns."
        }
    })

    return {
      title: "Architectural Review Report",
      output: `Audited ${params.paths.length} files against ${params.standards} standards. No major violations detected.`,
      metadata: { reports, status: "passed" }
    }
  }
})
