import { Database } from "bun:sqlite"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "heidi.vector" })

const VEC_EXT =
  "/home/heidi/opencode/node_modules/.bun/sqlite-vec-linux-x64@0.1.9/node_modules/sqlite-vec-linux-x64/vec0.so"

export namespace HeidiVector {
  function dbPath() {
    return path.join(Instance.worktree, ".opencode", "heidi", "vector.sqlite")
  }

  export async function init() {
    const p = dbPath()
    await Filesystem.write(path.join(path.dirname(p), ".keep"), "")
    const db = new Database(p, { create: true })

    try {
      db.loadExtension(VEC_EXT)
    } catch (e: unknown) {
      log.error("Failed to load sqlite-vec extension", { error: e })
      throw e
    }

    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
        file_id INTEGER,
        embedding float[384]
      )
    `)

    return db
  }

  export async function storeEmbedding(fileId: number, embedding: Float32Array) {
    const db = await init()
    const stmt = db.prepare("INSERT OR REPLACE INTO embeddings(file_id, embedding) VALUES (?, ?)")
    stmt.run(fileId, Buffer.from(embedding.buffer))
    db.close()
  }

  export async function searchSimilar(
    queryEmbedding: Float32Array,
    limit = 10,
  ): Promise<{ file_id: number; distance: number }[]> {
    const db = await init()
    const stmt = db.prepare(`
      SELECT file_id, distance
      FROM embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `)
    const results = stmt.all(Buffer.from(queryEmbedding.buffer), limit) as {
      file_id: number
      distance: number
    }[]
    db.close()
    return results
  }

  export function generateEmbedding(text: string): Float32Array {
    const vec = new Float32Array(384)
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i)
      vec[i % 384] += charCode / 255.0
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= norm
      }
    }
    return vec
  }
}
