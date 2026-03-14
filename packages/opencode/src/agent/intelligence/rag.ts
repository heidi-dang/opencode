import type { CodeChunk } from "./chunker"
import { CodeChunker } from "./chunker"
import { Filesystem } from "../../util/filesystem"
import { Log } from "../../util/log"
import * as path from "path"
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

    // Find all TS/JS files
    const allFiles = await Glob.scan("**/*.{ts,js,tsx,jsx}", {
      cwd: root,
      absolute: true,
      include: "file",
    })

    // Manual filtering since Glob.scan doesn't support ignore in this implementation
    const files = allFiles.filter(
      (f) => !f.includes("/node_modules/") && !f.includes("/dist/") && !f.includes("/.opencode/"),
    )

    const allChunks: CodeChunk[] = []
    for (const file of files) {
      try {
        const chunks = await CodeChunker.chunk(file)
        allChunks.push(...chunks)
      } catch (err) {
        this.log.warn("Failed to chunk file", { file, error: err })
      }
    }

    this.index = {
      chunks: allChunks,
      lastIndexed: Date.now(),
    }

    const indexPath = path.join(root, ".opencode", "rag", "index.json")
    await Filesystem.writeJson(indexPath, this.index)
    this.log.info("Reindexing complete", { totalChunks: allChunks.length })
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
