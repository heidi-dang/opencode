import { appendFile, writeFile } from "fs/promises"
import path from "path"
import { Flag } from "@/flag/flag"
import { Filesystem } from "@/util/filesystem"
import type { Agent } from "../agent/agent"
import { ToolID } from "./schema"
import { Truncate } from "./truncate"
import { TRUNCATION_DIR } from "./truncation-dir"

const CAPTURE_MAX = 256 * 1024
const PREVIEW_MAX = Truncate.MAX_BYTES

function take(text: string, max: number) {
  if (Buffer.byteLength(text, "utf-8") <= max) return text
  return Buffer.from(text).subarray(0, max).toString("utf-8")
}

function hint(file: string, agent?: Agent.Info) {
  const task =
    agent?.permission && agent.permission.some((item) => item.permission === "task" && item.action !== "deny")
  if (task) {
    return `The tool call succeeded but the output was truncated during capture. Full output saved to: ${file}\nUse the Task tool to have explore agent inspect this file with Grep and Read.`
  }
  return `The tool call succeeded but the output was truncated during capture. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to inspect sections.`
}

export namespace Output {
  export async function create() {
    let raw = ""
    let preview = ""
    let bytes = 0
    let file = ""

    const ensure = async () => {
      if (file) return file
      file = path.join(TRUNCATION_DIR, ToolID.ascending())
      await Filesystem.write(file, "")
      return file
    }

    return {
      async append(chunk: string) {
        bytes += Buffer.byteLength(chunk, "utf-8")
        if (file) {
          await appendFile(file, chunk)
          if (Buffer.byteLength(preview, "utf-8") < PREVIEW_MAX) {
            preview = take(preview + chunk, PREVIEW_MAX)
          }
          return
        }

        const next = raw + chunk
        if (Buffer.byteLength(next, "utf-8") <= (Flag.OPENCODE_OUTPUT_CAPTURE_MAX_BYTES ?? CAPTURE_MAX)) {
          raw = next
          return
        }

        const target = await ensure()
        await writeFile(target, next)
        preview = take(next, PREVIEW_MAX)
        raw = ""
      },
      view(max: number) {
        const text = file ? preview : raw
        if (Buffer.byteLength(text, "utf-8") <= max) return text
        return take(text, max) + "\n\n..."
      },
      async done(extra: string[], agent?: Agent.Info) {
        const suffix = extra.length ? `\n\n${extra.join("\n")}` : ""
        if (!file) {
          return {
            output: raw + suffix,
            metadata: {
              capturedBytes: bytes,
            },
          }
        }

        if (suffix) await appendFile(file, suffix)
        const kept = Buffer.byteLength(preview, "utf-8")
        const removed = Math.max(0, bytes - kept)
        return {
          output: `${preview}\n\n...${removed} bytes truncated...\n\n${hint(file, agent)}${suffix}`,
          metadata: {
            truncated: true,
            outputPath: file,
            capturedBytes: bytes,
          },
        }
      },
    }
  }
}
