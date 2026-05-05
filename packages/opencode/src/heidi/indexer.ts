import { Database } from "bun:sqlite"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Ripgrep } from "@/file/ripgrep"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { HeidiVector } from "./vector"
import { HeidiRerank } from "./rerank"
import { HeidiExtractor } from "./extractor"
import { HeidiLagMonitor } from "./lag-monitor"

export namespace HeidiIndexer {
  const log = Log.create({ service: "heidi.indexer" })

  function dbPath() {
    return path.join(Instance.worktree, ".opencode", "heidi", "index.sqlite")
  }

  export async function init() {
    const p = dbPath()
    await Filesystem.write(path.join(path.dirname(p), ".keep"), "")
    const db = new Database(p, { create: true })

    db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE,
        last_indexed INTEGER
      );
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        name TEXT,
        type TEXT,
        line INTEGER,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
      );
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        module TEXT,
        items TEXT,
        line INTEGER,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
      );
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        method TEXT,
        route_path TEXT,
        line INTEGER,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
      );
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        name TEXT,
        line INTEGER,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
      );
    `)

    return db
  }

  export async function indexRepository() {
    log.info("Starting repository index...")
    const db = await init()
    const files = await Array.fromAsync(Ripgrep.files({ cwd: Instance.worktree }))
    const now = Date.now()

    const insertFile = db.prepare("INSERT OR REPLACE INTO files (path, last_indexed) VALUES (?, ?)")
    const getFileId = db.prepare("SELECT id FROM files WHERE path = ?")
    const insertSymbol = db.prepare(
      "INSERT OR REPLACE INTO symbols (file_id, name, type, line) VALUES (?, ?, ?, ?)",
    )
    const insertImport = db.prepare(
      "INSERT OR REPLACE INTO imports (file_id, module, items, line) VALUES (?, ?, ?, ?)",
    )
    const insertRoute = db.prepare(
      "INSERT OR REPLACE INTO routes (file_id, method, route_path, line) VALUES (?, ?, ?, ?)",
    )
    const insertTest = db.prepare(
      "INSERT OR REPLACE INTO tests (file_id, name, line) VALUES (?, ?, ?)",
    )

    db.transaction(() => {
      for (const file of files) {
        if (file.includes(".opencode") || file.includes(".git") || file.includes("node_modules")) continue
        insertFile.run(file, now)
      }
    })()

    // Extract features from each file
    for (const file of files) {
      if (file.includes(".opencode") || file.includes(".git") || file.includes("node_modules")) continue

      const fileId = (getFileId.get(file) as { id: number } | undefined)?.id
      if (!fileId) continue

      try {
        const fullPath = path.join(Instance.worktree, file)
        const features = await HeidiExtractor.extractFromFile(fullPath)

        // Store symbols
        for (const sym of features.symbols) {
          insertSymbol.run(fileId, sym.name, sym.type, sym.line)
        }

        // Store imports
        for (const imp of features.imports) {
          insertImport.run(fileId, imp.module, JSON.stringify(imp.items), imp.line)
        }

        // Store routes
        for (const route of features.routes) {
          insertRoute.run(fileId, route.method, route.path, route.line)
        }

        // Store tests
        for (const test of features.tests) {
          insertTest.run(fileId, test.name, test.line)
        }

        // Generate embedding for vector search
        const content = await Filesystem.readText(fullPath)
        const embedding = HeidiVector.generateEmbedding(content)
        await HeidiVector.storeEmbedding(fileId, embedding)
      } catch {
        // Skip files that can't be processed
      }
    }

    // Update lag monitor with current commit
    await HeidiLagMonitor.updateIndex()

    log.info(`Indexed ${files.length} files.`)
    db.close()
  }

  export async function searchFiles(query: string, limit = 20) {
    const db = await init()
    const stmt = db.prepare("SELECT path FROM files WHERE path LIKE ? LIMIT ?")
    const results = stmt.all(`%${query}%`, limit) as { path: string }[]
    db.close()
    return results.map((r) => r.path)
  }

  export async function searchFilesSemantic(query: string, limit = 20) {
    const embedding = HeidiVector.generateEmbedding(query)
    const results = await HeidiVector.searchSimilar(embedding, limit)

    const db = await init()
    const getPath = db.prepare("SELECT path FROM files WHERE id = ?")
    const paths = results
      .map((r) => {
        const file = getPath.get(r.file_id) as { path: string } | undefined
        return file?.path
      })
      .filter(Boolean) as string[]
    db.close()

    return paths
  }

  export async function searchFilesReranked(query: string, limit = 20) {
    const [keywordResults, vectorResults] = await Promise.all([
      searchFiles(query, limit * 2).then((paths) => paths.map((path) => ({ path }))),
      searchFilesSemantic(query, limit * 2).then((paths) => paths.map((path) => ({ path }))),
    ])

    return HeidiRerank.rerankHybrid(keywordResults, vectorResults, limit)
  }

  export async function searchSymbols(fileId: number) {
    const db = await init()
    const stmt = db.prepare("SELECT name, type, line FROM symbols WHERE file_id = ?")
    const results = stmt.all(fileId) as { name: string; type: string; line: number }[]
    db.close()
    return results
  }

  export async function checkIndexLag() {
    return await HeidiLagMonitor.doctorCheck()
  }
}
