import { Tool } from "./tool"
import z from "zod"
import { spawn } from "child_process"
import { Instance } from "../project/instance"
import { HeidiJail } from "../heidi/jail"

const parameters = z.object({
  pattern: z.string().describe("The anti-pattern or bug signature to search for globally."),
  replacement: z.string().optional().describe("Optional replacement content if applying a global fix."),
  file_extension: z.string().describe("e.g. '.ts', '.tsx' to restrict search domains."),
})

export const VariantAnalysisTool = Tool.define("variant_analysis", async (ctx) => {
  return {
    description: "Hunt for functional bug variants across the entire monorepo based on a localized fix pattern.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const cwd = Instance.directory
      HeidiJail.assert(cwd)

      const ext = params.file_extension.replace(".", "")
      const cmd = `rg -n -g "*.${ext}" -e "${params.pattern}" .`

      return new Promise<{ title: string; output: string; metadata: any }>((resolve) => {
        const proc = spawn(cmd, { shell: true, cwd })
        let stdout = ""
        proc.stdout?.on("data", (data) => (stdout += data.toString()))

        proc.on("close", (code) => {
          if (!stdout.trim()) {
            resolve({ title: "Variant Analysis", output: `Variant Analysis: Zero instances of the anti-pattern '${params.pattern}' found globally.`, metadata: {} })
          } else {
            resolve({ title: "Variant Analysis", output: `Variant Analysis found potential clones:\n${stdout.slice(0, 4000)}\n\nYou can use other tools to fix these manually if no replacement was provided.`, metadata: {} })
          }
        })
      })
    },
  }
})
