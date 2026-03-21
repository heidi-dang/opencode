import z from "zod"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { Bus } from "../bus"
import { File } from "../file/service"
import { FileWatcher } from "../file/watcher"
import { FileTime } from "../file/time"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { trimDiff } from "./edit"
import { assertExternalDirectory } from "./external-directory"
import { Agent } from "../agent/agent"
import { HeidiState } from "@/heidi/state"
import { HeidiExec } from "@/heidi/exec"
import { HeidiJail } from "@/heidi/jail"

const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5

function assertOwnership(ctx: Tool.Context, filePath: string) {
  const own = ctx.extra?.ownership as { mode?: string; files?: string[] } | undefined
  if (!own || own.mode !== "exclusive_edit") return
  const rel = path.relative(Instance.worktree, filePath).replaceAll("\\", "/")
  if ((own.files ?? []).includes(rel)) return
  throw new Error(`write denied: file is outside exclusive ownership set (${rel})`)
}

export const WriteTool = Tool.define("write", {
  description: DESCRIPTION,
  parameters: z.object({
    content: z.string().describe("The content to write to the file"),
    filePath: z.string().describe("The absolute path to the file to write (must be absolute, not relative)"),
  }),
  async execute(params, ctx) {
    const filepath = path.isAbsolute(params.filePath) ? params.filePath : path.join(Instance.directory, params.filePath)
    await HeidiState.assertExecution(ctx, filepath)
    const state = await HeidiState.read(ctx.sessionID)
    HeidiJail.assert(filepath)
    await assertExternalDirectory(ctx, filepath)
    assertOwnership(ctx, filepath)

    const exists = await Filesystem.exists(filepath)
    const contentOld = exists ? await Filesystem.readText(filepath) : ""

    // Checkpoint
    const transactionId = state.resume.checkpoint_id
    const checkpoint = transactionId ?? (await HeidiExec.checkpoint(ctx.sessionID, [filepath], `write:${filepath}`))

    const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, params.content))
    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Instance.worktree, filepath)],
      always: ["*"],
      metadata: {
        filepath,
        diff,
      },
    })

    try {
      await Filesystem.write(filepath, params.content)
      await HeidiExec.changed(ctx.sessionID, [filepath])

      await Bus.publish(File.Event.Edited, {
        file: filepath,
      })
      await Bus.publish(FileWatcher.Event.Updated, {
        file: filepath,
        event: exists ? "change" : "add",
      })
      if (exists) await FileTime.read(ctx.sessionID, filepath)

      let output = "Wrote file successfully."
      await LSP.touchFile(filepath, true)
      const diagnostics = await LSP.diagnostics()
      const normalizedFilepath = Filesystem.normalizePath(filepath)
      let projectDiagnosticsCount = 0
      for (const [file, issues] of Object.entries(diagnostics)) {
        const errors = issues.filter((item) => item.severity === 1)
        if (errors.length === 0) continue
        const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
        const suffix =
          errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
        if (file === normalizedFilepath) {
          output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filepath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
          continue
        }
        if (projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
        projectDiagnosticsCount++
        output += `\n\nLSP errors detected in other files:\n<diagnostics file="${file}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
      }

      return {
        title: path.relative(Instance.worktree, filepath),
        metadata: {
          diagnostics,
          filepath,
          exists: exists,
          checkpoint,
        },
        output,
      }
    } catch (err) {
      await HeidiExec.rollback(ctx.sessionID, checkpoint)
      if (!transactionId) {
        // Only clear checkpoint if we created it
        const s = await HeidiState.read(ctx.sessionID)
        s.resume.checkpoint_id = null
        await HeidiState.write(ctx.sessionID, s)
      }
      throw err
    }
  },
})
