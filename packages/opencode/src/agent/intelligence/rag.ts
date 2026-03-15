import type { CodeChunk } from "./chunker"
import { CodeChunker } from "./chunker"
import { Filesystem } from "../../util/filesystem"
import { Log } from "../../util/log"
import * as path from "path"
import * as fs from "fs"
import { Glob } from "../../util/glob"

export interface RAGIndex {
  chunks: CodeChunk[]
  lastIndexed: number
}

export class CodebaseRAG {
  private static log = Log.create({ service: "codebase.rag" })
  private static index: RAGIndex | null = null
  private static indexRoot: string | null = null
  private static readonly INDEX_TTL_MS = 60 * 60 * 1000 // 1 hour

  /**
   * Clear the cached index to free memory
   * Call this when done with RAG operations or to force reindex
   */
  static clearCache(): void {
    this.index = null
    this.indexRoot = null
    this.log.info("RAG index cache cleared")
  }

  /**
   * Check if cached index is stale (expired TTL or different root)
   */
  private static isCacheStale(root: string): boolean {
    if (!this.index || this.indexRoot !== root) return true
    const age = Date.now() - this.index.lastIndexed
    return age > this.INDEX_TTL_MS
  }

  static async getIndex(root: string): Promise<RAGIndex> {
    // Return cached index if fresh
    if (this.index && !this.isCacheStale(root)) {
      return this.index
    }

    // Check if we need to reindex due to staleness
    if (this.index && this.isCacheStale(root)) {
      this.clearCache()
    }

    const indexPath = path.join(root, ".opencode", "rag", "index.json")
    if (await Filesystem.exists(indexPath)) {
      this.index = await Filesystem.readJson(indexPath)
      this.indexRoot = root
      return this.index!
    }

    await this.reindex(root)
    return this.index!
  }

  static async reindex(root: string): Promise<void> {
    this.log.info("Reindexing codebase for RAG...")

    const indexPath = path.join(root, ".opencode", "rag", "index.json")
    const existingIndex: RAGIndex | null = await Filesystem.readJson(indexPath).catch(() => null)
    const existingChunksMap = new Map<string, CodeChunk[]>()
    if (existingIndex) {
      for (const chunk of existingIndex.chunks) {
        const chunks = existingChunksMap.get(chunk.filePath) || []
        chunks.push(chunk)
        existingChunksMap.set(chunk.filePath, chunks)
      }
    }

    // Find all TS/JS files
    const allFiles = await Glob.scan("**/*.{ts,js,tsx,jsx}", {
      cwd: root,
      absolute: true,
      include: "file",
    })

    const files = allFiles.filter(
      (f) => !f.includes("/node_modules/") && !f.includes("/dist/") && !f.includes("/.opencode/"),
    )

    const allChunks: CodeChunk[] = []
    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file)
        const mtime = stats.mtimeMs
        const cached = existingChunksMap.get(file)

        // Incremental logic: if file matches cached mtime, reuse chunks
        if (cached && cached[0].metadata?.mtime === mtime) {
          allChunks.push(...cached)
          continue
        }

        const chunks = await CodeChunker.chunk(file)
        // Inject mtime into metadata for next run
        for (const chunk of chunks) {
          chunk.metadata = { ...chunk.metadata, mtime }
        }
        allChunks.push(...chunks)
      } catch (err) {
        this.log.warn("Failed to chunk file", { file, error: err })
      }
    }

    this.index = {
      chunks: allChunks,
      lastIndexed: Date.now(),
    }

    await Filesystem.writeJson(indexPath, this.index)
    this.log.info("Reindexing complete", { totalChunks: allChunks.length, incremental: allChunks.length - existingChunksMap.size })
  }

  static async search(root: string, query: string, limit: number = 5): Promise<CodeChunk[]> {
    const sessionIndex = await this.getIndex(root)
    const normalizedQuery = query.toLowerCase()

    // 1. Exact Name Match (Highest priority)
    const exactMatches = sessionIndex.chunks.filter((c) => c.name.toLowerCase() === normalizedQuery)

    // 2. Partial Name Match
    const partialNameMatches = sessionIndex.chunks.filter(
      (c) => !exactMatches.includes(c) && c.name.toLowerCase().includes(normalizedQuery),
    )

    // 3. Content Match
    const contentMatches = sessionIndex.chunks.filter(
      (c) =>
        !exactMatches.includes(c) &&
        !partialNameMatches.includes(c) &&
        c.content.toLowerCase().includes(normalizedQuery),
    )

    return [...exactMatches, ...partialNameMatches, ...contentMatches].slice(0, limit)
  }
}
