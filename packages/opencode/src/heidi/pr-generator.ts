import { Filesystem } from "@/util/filesystem"
import { git } from "@/util/git"
import { Instance } from "@/project/instance"
import path from "path"

export namespace HeidiPRGenerator {
  export interface PRDescription {
    title: string
    body: string
    files: string[]
  }

  export async function generate(sessionID: string): Promise<PRDescription> {
    const baseDir = path.join(Instance.worktree, ".opencode", "heidi", sessionID)

    // Read artifacts
    const diffSummary = path.join(baseDir, "diff_summary.md")
    const taskMd = path.join(baseDir, "task.md")

    const [diff, task] = await Promise.all([
      Filesystem.readText(diffSummary).catch(() => ""),
      Filesystem.readText(taskMd).catch(() => ""),
    ])

    // Get changed files
    const files = await git(["diff", "--name-only", "HEAD"], { cwd: Instance.worktree })
      .then((r) => (r.exitCode === 0 ? r.text().trim().split("\n").filter(Boolean) : []))
      .catch(() => [])

    // Generate title from task objective
    const titleMatch = task.match(/\*\*Goal\*\*:\s*(.+)/)
    const title = titleMatch?.[1]?.slice(0, 80) || "Automated PR"

    // Build body
    const lines = [
      "## Summary",
      "",
      "### From Task",
      task ? task.split("\n").slice(0, 10).join("\n") : "No task description available.",
      "",
      "### Changes",
      diff || "No diff summary available.",
      "",
      "### Files Changed",
      ...files.map((f) => `- ${f}`),
    ]

    return {
      title,
      body: lines.join("\n"),
      files,
    }
  }

  export async function writePRDescription(sessionID: string): Promise<string> {
    const desc = await generate(sessionID)
    const out = path.join(
      Instance.worktree,
      ".opencode",
      "heidi",
      sessionID,
      "pr_description.md",
    )
    const content = [
      `# ${desc.title}`,
      "",
      desc.body,
    ].join("\n")

    await Filesystem.write(out, content)
    return out
  }
}
