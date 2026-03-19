import z from "zod"
import { Tool } from "./tool"
import { Instance } from "../project/instance"

const DESCRIPTION = `Test Failure Tool - Detect and analyze test failures.`

export const TestFailureTool = Tool.define("test_failure", {
  description: DESCRIPTION,
  parameters: z.object({
    test_output: z.string().describe("Test output to analyze").optional(),
    test_command: z.string().describe("Command to run tests").optional(),
  }),
  async execute(params, ctx) {
    let output = params.test_output

    if (!output && params.test_command) {
      await ctx.ask({ permission: "bash", patterns: [params.test_command], always: [params.test_command], metadata: {} })
      const result = Bun.spawn({ cmd: params.test_command.split(" "), cwd: Instance.directory, stdout: "pipe", stderr: "pipe" })
      output = await new Response(result.stdout).text() + "\n" + await new Response(result.stderr).text()
    }

    if (!output) {
      return { title: "No Test Output", metadata: { count: 0 }, output: "No test output provided" }
    }

    const failures: { name: string; file: string; reason: string }[] = []
    
    // Parse Jest/Vitest
    const jestMatch = output.match(/FAIL\s+(.+?)\s*\n([\s\S]*?)(?=FAIL|PASS|\n\n|$)/g)
    if (jestMatch) {
      for (const block of jestMatch) {
        const testMatch = block.match(/✕\s+(.+?)\n([\s\S]*?)(?=\n\s*\n|$)/)
        if (testMatch) {
          failures.push({ name: testMatch[1].trim(), file: block.split("\n")[0], reason: testMatch[2].split("\n")[0] })
        }
      }
    }

    // Parse pytest
    const pytestMatch = output.match(/FAILED\s+(.+?::.+?)\s*-\s*(.+?)(?=\n\n|\n=|$)/g)
    if (pytestMatch) {
      for (const match of pytestMatch) {
        const parts = match.match(/FAILED\s+(.+?::.+?)\s*-\s*(.+)/)
        if (parts) failures.push({ name: parts[1], file: parts[1].split("::")[0], reason: parts[2] })
      }
    }

    const patterns: string[] = []
    for (const f of failures) {
      const r = f.reason.toLowerCase()
      if (r.includes("timeout")) patterns.push("Timeout issues")
      if (r.includes("network")) patterns.push("Network dependency")
      if (r.includes("undefined") || r.includes("null")) patterns.push("Null/undefined values")
    }

    const summary = patterns.length > 0 ? `Common issues: ${[...new Set(patterns)].join(", ")}` : "No common patterns found"

    return {
      title: `${failures.length} Failure(ies)`,
      metadata: { count: failures.length },
      output: failures.length > 0 
        ? failures.map(f => `FAIL: ${f.name}\n  Reason: ${f.reason}`).join("\n\n") + "\n\n## Analysis\n" + summary
        : "No test failures detected",
    }
  },
})
