import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Identifies flaky test patterns, long-running tests, and structural 'smells' in test files. Suggests optimizations to improve CI reliability.`

export const TestLinterTool = Tool.define("test_linter", {
  description: DESCRIPTION,
  parameters: z.object({
    directory: z.string().describe("The directory to audit for test quality.")
  }),
  async execute(params, ctx) {
    const { $ } = await import("bun")
    const smells = []
    
    // Check for .only
    const only = await $`grep -r ".only" ${params.directory} --include="*.test.ts" --include="*.spec.ts"`.text().catch(() => "")
    if (only) smells.push({ type: "Flakiness Risk", details: "Found .only in tests: " + only.split("\n")[0] })

    // Check for hardcoded timeouts > 10s
    const timeouts = await $`grep -r "timeout: [1-9][0-9][0-9][0-9][0-9]" ${params.directory}`.text().catch(() => "")
    if (timeouts) smells.push({ type: "Performance Smell", details: "Found long hardcoded timeouts." })

    return {
      title: "Test Quality Audit",
      output: smells.length > 0 ? `Found ${smells.length} test smells.` : "No critical flakiness detected.",
      metadata: { smells, status: smells.length > 0 ? "failed" : "passed" }
    }
  }
})
