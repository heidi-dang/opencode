import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "fs/promises"

const VEC_EXT = "/home/heidi/opencode/node_modules/.bun/sqlite-vec-linux-x64@0.1.9/node_modules/sqlite-vec-linux-x64/vec0.so"

describe("HeidiVector", () => {
  test("should create vector table with sqlite-vec extension", async () => {
    const dbPath = "/tmp/test-vector.db"
    await fs.unlink(dbPath).catch(() => {})

    const db = new Database(dbPath, { create: true })

    // Load sqlite-vec extension
    db.loadExtension(VEC_EXT)

    // Create virtual table for vector search
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
        embedding float[384]
      )
    `)

    // Verify table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' OR type='virtual'").all() as {
      name: string
    }[]
    expect(tables.some((t) => t.name === "vec_items")).toBe(true)

    db.close()
    await fs.unlink(dbPath).catch(() => {})
  })

  test("should store and search embeddings", async () => {
    const dbPath = "/tmp/test-vector-search.db"
    await fs.unlink(dbPath).catch(() => {})

    const db = new Database(dbPath, { create: true })
    db.loadExtension(VEC_EXT)

    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
        embedding float[4]
      )
    `)

    // Insert test embeddings - need to use proper format for vec0
    const insert = db.prepare("INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)")

    // Use raw buffer
    const vec1 = Buffer.from(new Float32Array([1.0, 0.0, 0.0, 0.0]).buffer)
    const vec2 = Buffer.from(new Float32Array([0.0, 1.0, 0.0, 0.0]).buffer)
    const vec3 = Buffer.from(new Float32Array([0.9, 0.1, 0.0, 0.0]).buffer)

    insert.run(1, vec1)
    insert.run(2, vec2)
    insert.run(3, vec3)

    // Search for vectors similar to vec1
    const query = Buffer.from(new Float32Array([1.0, 0.0, 0.0, 0.0]).buffer)
    const results = db
      .prepare(`
      SELECT rowid, distance
      FROM vec_items
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT 2
    `)
      .all(query) as { rowid: number; distance: number }[]

    expect(results.length).toBe(2)
    expect(results[0].rowid).toBe(1) // Closest to itself
    expect(results[0].distance).toBeLessThan(results[1].distance)

    db.close()
    await fs.unlink(dbPath).catch(() => {})
  })
})
