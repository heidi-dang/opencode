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

function region(content: string, anchor: string, search: string) {
  const idx = content.indexOf(anchor)
  if (idx < 0) return ""
  // If search is also found, show the region around the match
  const searchIdx = content.indexOf(search, Math.max(0, idx - 500))
  const start = Math.max(0, (searchIdx >= 0 ? searchIdx : idx) - 200)
  const end = Math.min(content.length, (searchIdx >= 0 ? searchIdx : idx) + (searchIdx >= 0 ? search.length : anchor.length) + 200)
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
      let after = ""

      if (item.anchor) {
        const anchorIdx = before.indexOf(item.anchor)
        if (anchorIdx < 0) {
          throw new Error(`Anchor not found in ${file}`)
        }
        
        // Find search_string within +/- 1000 chars of anchor
        const searchRegionStart = Math.max(0, anchorIdx - 1000)
        const searchRegionEnd = Math.min(before.length, anchorIdx + item.anchor.length + 1000)
        const searchRegion = before.slice(searchRegionStart, searchRegionEnd)
        
        if (!searchRegion.includes(item.search_string)) {
          throw new Error(`search_string not found near anchor in ${file}\n\n<context>\n${region(before, item.anchor, item.search_string)}\n</context>`)
        }
        
        // Ensure uniqueness within the specific region
        const firstMatch = searchRegion.indexOf(item.search_string)
        const lastMatch = searchRegion.lastIndexOf(item.search_string)
        if (firstMatch !== lastMatch) {
          throw new Error(`Multiple matches for search_string found near anchor in ${file}. Provide more unique search_string or anchor.`)
        }
        
        const absoluteIdx = searchRegionStart + firstMatch
        after = before.substring(0, absoluteIdx) + item.replace_string + before.substring(absoluteIdx + item.search_string.length)
      } else {
        if (!before.includes(item.search_string)) {
          throw new Error(`search_string not found in ${file}`)
        }
        const firstMatch = before.indexOf(item.search_string)
        const lastMatch = before.lastIndexOf(item.search_string)
        if (firstMatch !== lastMatch) {
          throw new Error(`Multiple matches for search_string found in ${file}. Use an 'anchor' for precision.`)
        }
        after = before.replace(item.search_string, item.replace_string)
      }
      next.push({ path: file, before, after })
    }

    const files = next.map((item) => item.path)
    const checkpoint = await HeidiExec.checkpoint(ctx.sessionID, files, "replace_file_content")
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
