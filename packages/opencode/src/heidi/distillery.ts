import { Filesystem } from "@/util/filesystem"
import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { Log } from "../util/log"
import path from "path"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "heidi-distillery" })

export namespace HeidiDistillery {
  /**
   * Distills a completed task into a knowledge nugget to be used for future planning.
   */
  export async function distill(task_id: SessionID) {
    try {
      const state = await HeidiState.read(task_id)
      const files = await HeidiState.files(task_id)
      
      const plan = await Filesystem.readText(files.implementation_plan).catch(() => "")
      const verify = await Filesystem.readText(files.verification).catch(() => "")
      
      const nugget = [
        `# Distilled Knowledge: ${state.objective.text}`,
        `**Task Date**: ${new Date().toISOString().split('T')[0]}`,
        `**Session**: ${task_id}`,
        "",
        "## Architectural Patterns Applied",
        extractPatterns(plan),
        "",
        "## Lessons Learned & Gotchas",
        extractLessons(verify),
        "",
        "## Changed Files",
        state.changed_files.map(f => `- ${path.relative(Instance.worktree, f)}`).join("\n")
      ].join("\n")

      const knowledgeDir = path.join(Instance.directory, ".opencode", "knowledge")
      const outPath = path.join(knowledgeDir, `distilled-${Date.now()}.md`)
      await Filesystem.write(outPath, nugget)
      
      log.info("Knowledge distilled", { outPath })
    } catch (err) {
      log.error("Distillation failed", { err })
    }
  }

  function extractPatterns(plan: string): string {
    // Simple heuristic-based extraction for now
    const lines = plan.split("\n")
    const strategy = lines.find(l => l.includes("strategy")) || "Standard implementation"
    return `- ${strategy.replace(/^[#*-]+/, "").trim()}`
  }

  function extractLessons(verify: string): string {
    const lines = verify.split("\n")
    const warnings = lines.filter(l => l.toLowerCase().includes("warning") || l.toLowerCase().includes("note"))
    if (warnings.length === 0) return "- No significant gotchas detected during verification."
    return warnings.map(w => `- ${w.trim()}`).join("\n")
  }
}
