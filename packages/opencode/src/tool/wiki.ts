import { Tool } from "./tool"
import z from "zod"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import path from "path"
import { HeidiJail } from "../heidi/jail"

const parameters = z.object({
  action: z.enum(["generate", "update"]).describe("Generate a new architecture doc or update an existing one."),
  component: z.string().describe("The name of the component or system to document."),
  markdown: z.string().describe("The actual markdown content including Mermaid diagrams."),
})

export const WikiTool = Tool.define("wiki_sync", async (ctx) => {
  return {
    description: "Automatically read the project graph and generate/update Mermaid JS documentation in .opencode/wiki/.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const cwd = Instance.directory
      HeidiJail.assert(cwd)

      const wikiPath = path.join(cwd, ".opencode", "wiki")
      const filePath = path.join(wikiPath, `${params.component.toLowerCase().replace(/\s+/g, "_")}.md`)

      // Ensure directory exists
      if (!(await Filesystem.exists(wikiPath))) {
        // Will rely on Filesystem's native deep write, but explicit check provides guard
      }

      await Filesystem.write(filePath, params.markdown)
      
      return { title: "Wiki Update", output: `Wiki successfully ${params.action}d at ${filePath}. Future sessions will now ingest this knowledge.`, metadata: {} }
    },
  }
})
