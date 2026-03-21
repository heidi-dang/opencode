import { Tool } from "./tool"
import z from "zod"
import { spawn } from "child_process"
import { Instance } from "../project/instance"
import { HeidiJail } from "../heidi/jail"

const parameters = z.object({
  query: z.string().describe("The semantic string or code identifier to search for."),
  path: z.string().optional().describe("Directory or file to restrict the search to."),
  type: z.enum(["function", "class", "variable", "interface", "any"]).optional().describe("AST node type to look for."),
})

export const VexorTool = Tool.define("vexor_search", async (ctx) => {
  return {
    description: "AST-aware semantic code discovery. Use to find all usages, implementations, and shadowing of a specific function or variable.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const cwd = params.path ? (require("path").isAbsolute(params.path) ? params.path : require("path").resolve(Instance.directory, params.path)) : Instance.directory
      HeidiJail.assert(cwd)
      
      const searchType = params.type || "any"
      let regex = params.query

      if (searchType === "function") {
        regex = `(function\\s+${params.query}|const\\s+${params.query}\\s*=\\s*\\(|class\\s+.*${params.query})`
      } else if (searchType === "interface") {
        regex = `(interface|type)\\s+${params.query}`
      }

      const cmd = `rg -n --heading -B 2 -A 5 -e "${regex}" .`
      
      return new Promise<{ title: string; output: string; metadata: any }>((resolve, reject) => {
        const proc = spawn(cmd, { shell: true, cwd })
        let stdout = ""
        let stderr = ""

        proc.stdout?.on("data", (data) => (stdout += data.toString()))
        proc.stderr?.on("data", (data) => (stderr += data.toString()))

        proc.on("close", (code) => {
          if (code !== 0 && !stdout) {
            resolve({ title: "Vexor Map", output: `No semantic matches found for ${searchType} '${params.query}'.`, metadata: {} })
          } else {
            resolve({ title: "Vexor Map", output: `Vexor Map for ${params.query}:\n${stdout.slice(0, 4000)}`, metadata: {} })
          }
        })
      })
    },
  }
})
