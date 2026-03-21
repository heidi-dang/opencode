import { Tool } from "./tool"
import z from "zod"
import { spawn } from "child_process"
import { Instance } from "../project/instance"

const parameters = z.object({
  test_file: z.string().optional().describe("Specific Playwright test file to run, or empty to run all."),
})

export const PlaywrightTool = Tool.define("playwright_run", async (ctx) => {
  return {
    description: "Execute Playwright E2E functional tests natively, returning browser traversal results.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const cwd = Instance.directory
      const fileArg = params.test_file ? params.test_file : ""
      const cmd = `npx --yes playwright test ${fileArg} --reporter=list`

      return new Promise<{ title: string; output: string; metadata: any }>((resolve) => {
        const proc = spawn(cmd, { shell: true, cwd })
        let stdout = ""
        let stderr = ""

        proc.stdout?.on("data", (data) => (stdout += data.toString()))
        proc.stderr?.on("data", (data) => (stderr += data.toString()))

        proc.on("close", (code) => {
          if (code === 0) {
            resolve({ title: "Playwright Complete", output: `Playwright Verification Passed:\n${stdout.slice(0, 2000)}`, metadata: {} })
          } else {
            resolve({ title: "Playwright Complete", output: `Playwright Verification Failed:\n${stdout.slice(0, 2000)}\nStderr:\n${stderr.slice(0, 1000)}`, metadata: {} })
          }
        })
      })
    },
  }
})
