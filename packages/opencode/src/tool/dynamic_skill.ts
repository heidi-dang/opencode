import { Tool } from "./tool"
import z from "zod"
import { spawn } from "child_process"
import { Instance } from "../project/instance"
import { HeidiJail } from "../heidi/jail"
import { ToolRegistry } from "./registry"
import path from "path"
import fs from "fs/promises"
import os from "os"

const parameters = z.object({
  query: z.string().describe("A keyword or name of the skill to search for and install from the community repository."),
})

export const DynamicSkillTool = Tool.define("install_community_skill", async (ctx) => {
  return {
    description: "Search, download, and dynamically hot-load a skill and its companion tools from the antigravity-awesome-skills repository to handle novel user requests.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const cwd = Instance.directory
      HeidiJail.assert(cwd)

      const tmpZip = path.join(os.tmpdir(), `awesome-skills-${Date.now()}.zip`)
      const extractDir = path.join(os.tmpdir(), `awesome-skills-${Date.now()}`)
      
      ctx.metadata({ title: `Discovering community skills matching '${params.query}'...` })
      
      const url = "https://github.com/sickn33/antigravity-awesome-skills/archive/refs/heads/main.zip"
      await new Promise<void>((resolve, reject) => {
        const curl = spawn(`curl -L -s -o ${tmpZip} ${url}`, { shell: true })
        curl.on("close", (code) => code === 0 ? resolve() : reject(new Error("Failed to download repo")))
      })

      await new Promise<void>((resolve, reject) => {
        const unzip = spawn(`unzip -q ${tmpZip} -d ${extractDir}`, { shell: true })
        unzip.on("close", (code) => code === 0 ? resolve() : reject(new Error("Failed to unzip repo")))
      })

      const repoRoot = path.join(extractDir, "antigravity-awesome-skills-main")
      
      const skillsDir = path.join(repoRoot, "skills")
      const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => [])
      const folders = entries.filter((e: any) => e.isDirectory() && !e.name.startsWith(".")).map((e: any) => e.name)
      
      let bestMatch = folders.find((f: string) => f.toLowerCase().includes(params.query.toLowerCase()))
      if (!bestMatch) {
         return {
           title: "Dynamic Skill Loader",
           output: `Could not find a perfect match for '${params.query}'. Available community skills: ${folders.join(", ")}. Please try again with an exact name.`,
           metadata: {}
         }
      }

      ctx.metadata({ title: `Installing community skill: ${bestMatch}...` })

      const sourceDir = path.join(skillsDir, bestMatch)
      const targetDir = path.join(cwd, ".opencode", "skills", bestMatch)
      
      await new Promise<void>((resolve, reject) => {
        // mkdir -p targetDir and copy all contents from sourceDir to targetDir
        const cp = spawn(`mkdir -p ${targetDir} && cp -R ${sourceDir}/* ${targetDir}/`, { shell: true })
        cp.on("close", (code) => code === 0 ? resolve() : reject(new Error("Failed to copy skill")))
      })

      const files = await fs.readdir(targetDir).catch(() => [])
      const tsFiles = files.filter((f: string) => f.endsWith(".ts"))
      
      let hotLoadedTools = []
      for (const file of tsFiles) {
        try {
           const modulePath = path.join(targetDir, file)
           const mod = await import(modulePath)
           for (const [key, value] of Object.entries(mod)) {
             if (value && typeof value === "object" && (value as any).id && typeof (value as any).init === "function") {
                 await ToolRegistry.register(value as any)
                 hotLoadedTools.push((value as any).id)
             }
           }
        } catch (err) {
           console.error("Failed to hot load", err)
        }
      }

      // Cleanup
      await fs.rm(tmpZip, { force: true }).catch(() => {})
      await fs.rm(extractDir, { force: true, recursive: true }).catch(() => {})

      ctx.metadata({ title: `Successfully hot-loaded ${bestMatch}!` })

      return {
        title: "Dynamic Skill Loader",
        output: `Successfully discovered and installed community skill: ${bestMatch}\n\nSkill Markdown written to ${targetDir}/SKILL.md.\n\nHot-loaded native tools: ${hotLoadedTools.length > 0 ? hotLoadedTools.join(", ") : "None"}.\n\nHeidi will automatically refresh her context and now possesses this skill/tool!`,
        metadata: {}
      }
    }
  }
})
