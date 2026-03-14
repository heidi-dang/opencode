import fs from "fs/promises"
import path from "path"
import crypto from "crypto"
import { Global } from "../global"
import { Identifier } from "../id/id"
import { PermissionNext } from "../permission/next"
import type { Agent } from "../agent/agent"
import { Scheduler } from "../scheduler"
import { Filesystem } from "../util/filesystem"
import { Glob } from "../util/glob"
import { ToolID } from "./schema"

export namespace Truncate {
  export const MAX_LINES = 2000
  export const MAX_BYTES = 50 * 1024
  export const DIR = path.join(Global.Path.data, "tool-output")
  export const GLOB = path.join(DIR, "*")
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
  const HOUR_MS = 60 * 60 * 1000

  // Bounded output constants for message payloads (smaller caps)
  // See docs/implementation-tool-output-performance.md
  export const MESSAGE_PREVIEW_MAX_LINES = 50
  export const MESSAGE_PREVIEW_MAX_BYTES = 10_000
  export const FULL_OUTPUT_MAX_BYTES = 1_000_000
  export const HYDRATION_THRESHOLD_BYTES = 5_000

  export type Result = { content: string; truncated: false } | { content: string; truncated: true; outputPath: string }

  export interface Options {
    maxLines?: number
    maxBytes?: number
    direction?: "head" | "tail"
  }

  // Bounded capture result for message payloads
  export interface BoundedResult {
    preview: string
    hasMore: boolean
    ref?: string
    fullBytes: number
    previewLines: number
    previewBytes: number
  }

  // Compute content hash for content-addressed storage
  function computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex")
  }

  // Get blob directory path from hash prefix
  function getBlobDir(hash: string): string {
    return path.join(DIR, "blobs", hash.slice(0, 2))
  }

  // Get blob file path from hash
  function getBlobPath(hash: string): string {
    return path.join(getBlobDir(hash), `${hash}.blob`)
  }

  export function init() {
    Scheduler.register({
      id: "tool.truncation.cleanup",
      interval: HOUR_MS,
      run: cleanup,
      scope: "global",
    })
    // Also register orphan sweep for blob storage
    // This cleans up blobs from crashed/interrupted runs
    Scheduler.register({
      id: "tool.truncation.sweep",
      interval: 4 * HOUR_MS, // Every 4 hours
      run: async () => {
        // For now, just run sweep with empty known refs
        // In production, would query DB for all known refs
        const deleted = await sweepBlobs(new Set())
        if (deleted > 0) {
          Log.create({ service: "truncation" }).info("blob sweep completed", { deleted })
        }
      },
      scope: "global",
    })
  }

  export async function cleanup() {
    const cutoff = Identifier.timestamp(Identifier.create("tool", false, Date.now() - RETENTION_MS))
    const entries = await Glob.scan("tool_*", { cwd: DIR, include: "file" }).catch(() => [] as string[])
    for (const entry of entries) {
      if (Identifier.timestamp(entry) >= cutoff) continue
      await fs.unlink(path.join(DIR, entry)).catch(() => {})
    }
  }

  // Orphan sweep for blobs - delete blobs not referenced by any message
  // This is called periodically and on session cleanup
  export async function sweepBlobs(knownRefs: Set<string>): Promise<number> {
    let deleted = 0
    const blobsDir = path.join(DIR, "blobs")
    
    try {
      const hashPrefixes = await fs.readdir(blobsDir)
      for (const prefix of hashPrefixes) {
        const prefixDir = path.join(blobsDir, prefix)
        const stat = await fs.stat(prefixDir)
        if (!stat.isDirectory()) continue
        
        const hashes = await fs.readdir(prefixDir)
        for (const hash of hashes) {
          if (!hash.endsWith(".blob")) continue
          const fullHash = hash.slice(0, -5) // Remove .blob
          if (knownRefs.has(fullHash)) continue
          
          // Orphan found - delete it
          await fs.unlink(path.join(prefixDir, hash)).catch(() => {})
          deleted++
        }
        
        // Cleanup empty prefix dir
        const remaining = await fs.readdir(prefixDir).catch(() => [])
        if (remaining.length === 0) {
          await fs.rmdir(prefixDir).catch(() => {})
        }
      }
    } catch {
      // Blobs dir doesn't exist yet
    }
    
    return deleted
  }

  function hasTaskTool(agent?: Agent.Info): boolean {
    if (!agent?.permission) return false
    const rule = PermissionNext.evaluate("task", "*", agent.permission)
    return rule.action !== "deny"
  }

  /**
   * Bounded capture for message payloads.
   * Stores full output if over preview cap, returns bounded preview + ref.
   * 
   * Write order: Full output -> Blob storage first, then return preview + ref
   */
  export async function boundedCapture(output: string): Promise<BoundedResult> {
    const lines = output.split("\n")
    const totalBytes = Buffer.byteLength(output, "utf-8")
    
    // If under caps, no truncation needed
    if (lines.length <= MESSAGE_PREVIEW_MAX_LINES && totalBytes <= MESSAGE_PREVIEW_MAX_BYTES) {
      return {
        preview: output,
        hasMore: false,
        fullBytes: totalBytes,
        previewLines: lines.length,
        previewBytes: totalBytes,
      }
    }
    
    // Full output exceeds caps - store full output, return bounded preview
    const fullBytes = totalBytes
    
    // Only store full output if under the hard cap
    let ref: string | undefined
    if (totalBytes <= FULL_OUTPUT_MAX_BYTES) {
      const hash = computeHash(output)
      const blobPath = getBlobPath(hash)
      
      // Ensure directory exists
      await fs.mkdir(getBlobDir(hash), { recursive: true }).catch(() => {})
      
      // Write full output to blob storage
      await Filesystem.write(blobPath, output)
      ref = hash
    }
    
    // Generate bounded preview (last N lines so errors are visible)
    const previewLines: string[] = []
    const previewBytesLimit = MESSAGE_PREVIEW_MAX_BYTES
    let previewBytes = 0
    
    // Take from end of output (tail) to show recent errors
    for (let i = lines.length - 1; i >= 0 && previewLines.length < MESSAGE_PREVIEW_MAX_LINES; i--) {
      const line = lines[i]!
      const lineBytes = Buffer.byteLength(line, "utf-8") + (previewLines.length > 0 ? 1 : 0)
      
      if (previewBytes + lineBytes > previewBytesLimit) break
      
      previewLines.unshift(line) // Add to front
      previewBytes += lineBytes
    }
    
    const preview = previewLines.join("\n")
    const hasMore = ref !== undefined || totalBytes > previewBytes
    
    return {
      preview,
      hasMore,
      ref,
      fullBytes,
      previewLines: previewLines.length,
      previewBytes,
    }
  }

  /**
   * Retrieve full output by content hash ref.
   * Returns null if not found or ref is undefined.
   */
  export async function retrieveFullOutput(ref: string): Promise<string | null> {
    if (!ref) return null
    
    const blobPath = getBlobPath(ref)
    try {
      return await Filesystem.readText(blobPath)
    } catch {
      return null
    }
  }

  export async function output(text: string, options: Options = {}, agent?: Agent.Info): Promise<Result> {
    const maxLines = options.maxLines ?? MAX_LINES
    const maxBytes = options.maxBytes ?? MAX_BYTES
    const direction = options.direction ?? "head"
    const lines = text.split("\n")
    const totalBytes = Buffer.byteLength(text, "utf-8")

    if (lines.length <= maxLines && totalBytes <= maxBytes) {
      return { content: text, truncated: false }
    }

    const out: string[] = []
    let i = 0
    let bytes = 0
    let hitBytes = false

    if (direction === "head") {
      for (i = 0; i < lines.length && i < maxLines; i++) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.push(lines[i])
        bytes += size
      }
    } else {
      for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.unshift(lines[i])
        bytes += size
      }
    }

    const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
    const unit = hitBytes ? "bytes" : "lines"
    const preview = out.join("\n")

    const id = ToolID.ascending()
    const filepath = path.join(DIR, id)
    await Filesystem.write(filepath, text)

    const hint = hasTaskTool(agent)
      ? `The tool call succeeded but the output was truncated. Full output saved to: ${filepath}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
      : `The tool call succeeded but the output was truncated. Full output saved to: ${filepath}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`
    const message =
      direction === "head"
        ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
        : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`

    return { content: message, truncated: true, outputPath: filepath }
  }
}
