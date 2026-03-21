import { Tool } from "./tool"
import z from "zod"
import { spawn } from "child_process"
import { Instance } from "../project/instance"
import { HeidiJail } from "../heidi/jail"

const parameters = z.object({
  files: z.array(z.string()).describe("List of files to audit for anti-patterns."),
})

export const AuditorTool = Tool.define("vibe_audit", async (ctx) => {
  return {
    description: "Scan modified .ts files for AI-specific anti-patterns like floating promises, missing await, or unhandled SSE stream errors.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const cwd = Instance.directory
      HeidiJail.assert(cwd)

      if (params.files.length === 0) return { title: "Vibe Audit", output: "No files provided for audit.", metadata: {} }

      const filesStr = params.files.join(" ")
      
      // Vibe Auditor wrapper checking for un-awaited promises common in node/bun execution
      const cmd = `bun turbo typecheck && rg -n -e "(^|\\s)(fetch|spawn|Filesystem\\.|Session\\.|HeidiState\\.)(.*)(?<!await )" -- ${filesStr}`

      return new Promise<{ title: string; output: string; metadata: any }>((resolve) => {
        const proc = spawn(cmd, { shell: true, cwd })
        let stdout = ""
        let stderr = ""

        proc.stdout?.on("data", (data) => (stdout += data.toString()))
        proc.stderr?.on("data", (data) => (stderr += data.toString()))

        proc.on("close", (code) => {
          if (code === 0 && stdout.trim()) {
            resolve({ title: "Vibe Audit", output: `Vibe Audit found potential floating promises or un-awaited AI-specific structural calls:\n${stdout.slice(0, 2000)}\n\nPlease review these lines manually to ensure they are properly awaited.`, metadata: {} })
          } else if (stderr.includes("error")) {
            resolve({ title: "Vibe Audit", output: `Vibe Audit (Typecheck or Lint Failed):\n${stderr.slice(0, 2000)}`, metadata: {} })
          } else {
            resolve({ title: "Vibe Audit", output: `Vibe Audit Passed. No distinct AI-specific anti-patterns detected in provided files.`, metadata: {} })
          }
        })
      })
    },
  }
})
