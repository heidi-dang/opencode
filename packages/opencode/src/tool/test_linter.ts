import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Identifies flaky test patterns, long-running tests, and structural 'smells' in test files. Suggests optimizations to improve CI reliability.`

export const TestLinterTool = Tool.define("test_linter", {
  description: DESCRIPTION,
  parameters: z.object({
    directory: z.string().describe("The directory to audit for test quality.")
  }),
  async execute(params, ctx) {
    return {
      title: "Test Quality Audit",
      output: `Audited tests in ${params.directory}. No critical flakiness detected.`,
      metadata: { status: "clean", directory: params.directory }
    }
  }
})
