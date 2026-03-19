import z from "zod"
import path from "path"
import { Tool } from "./tool"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"
import { assertExternalDirectory } from "./external-directory"
import { HeidiState } from "@/heidi/state"
import { HeidiExec } from "@/heidi/exec"
import { HeidiJail } from "@/heidi/jail"

const Item = z.object({
  path: z.string(),
  search_string: z.string(),
  replace_string: z.string(),
  anchor: z.string().optional(),
})

function region(content: string, anchor: string) {
  const idx = content.indexOf(anchor)
  if (idx < 0) return ""
  const start = Math.max(0, idx - 200)
  const end = Math.min(content.length, idx + anchor.length + 200)
  return content.slice(start, end)
}

export const ReplaceFileContentTool = Tool.define("replace_file_content", {
  description:
    "Apply anchored replacements with optional multi-file transaction semantics. If any anchor or search fails, all edits are rejected.",
  parameters: z.object({
    path: z.string().optional(),
    search_string: z.string().optional(),
    replace_string: z.string().optional(),
    anchor: z.string().optional(),
    edits: z.array(Item).optional(),
  }),
  async execute(params, ctx) {
    const state = await HeidiState.ensure(ctx.sessionID, "")
    if (state.fsm_state !== "EXECUTION" && state.fsm_state !== "VERIFICATION") {
      throw new Error(`replace_file_content is only available in EXECUTION or VERIFICATION. Current state: ${state.fsm_state}`)
    }

    const edits =
      params.edits ??
      (params.path && params.search_string !== undefined && params.replace_string !== undefined
        ? [
            {
              path: params.path,
              search_string: params.search_string,
              replace_string: params.replace_string,
              anchor: params.anchor,
            },
          ]
        : [])

    if (edits.length === 0) throw new Error("Provide either edits[] or path/search_string/replace_string")

    const next = [] as { path: string; before: string; after: string }[]
    for (const item of edits) {
      const file = path.isAbsolute(item.path) ? item.path : path.join(Instance.directory, item.path)
      HeidiJail.assert(file)
      await assertExternalDirectory(ctx, file)
      const before = await Filesystem.readText(file)
      if (item.anchor && !before.includes(item.anchor)) {
        throw new Error(`Anchor mismatch for ${file}\n\n<region>${region(before, item.search_string)}</region>`)
      }
      if (!before.includes(item.search_string)) {
        throw new Error(
          `search_string not found for ${file}\n\n<region>${region(before, item.anchor ?? item.search_string)}</region>`,
        )
      }
      const after = before.replace(item.search_string, item.replace_string)
      next.push({ path: file, before, after })
    }

    const files = next.map((item) => item.path)
    const checkpoint = await HeidiExec.checkpoint(ctx.sessionID, "replace_file_content", files)
    try {
      await Promise.all(next.map((item) => Filesystem.write(item.path, item.after)))
      await HeidiExec.changed(ctx.sessionID, files)
    } catch (err) {
      await HeidiExec.rollback(ctx.sessionID, checkpoint)
      throw err
    }

    return {
      title: `updated ${next.length} file(s)`,
      metadata: { checkpoint, files },
      output: next.map((item) => item.path).join("\n"),
    }
  },
})
