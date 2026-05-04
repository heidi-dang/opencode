import { Database } from "bun:sqlite"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Ripgrep } from "@/file/ripgrep"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"

export namespace HeidiIndexer {
  const log = Log.create({ service: "heidi.indexer" })

  function getDbPath() {
    return path.join(Instance.worktree, ".opencode", "heidi", "index.sqlite")
  }

  export async function init() {
    const dbPath = getDbPath()
    await Filesystem.mkdir(path.dirname(dbPath))
    const db = new Database(dbPath, { create: true })

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
    
    // Create an FTS5 virtual table for fast full-text searching
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
        name,
        type,
        path UNINDEXED,
        line UNINDEXED,
        content=symbols
      );
    `)

    return db
  }

  export async function indexRepository() {
    log.info("Starting repository index...")
    const db = await init()
    const files = await Array.fromAsync(Ripgrep.files({ cwd: Instance.worktree }))
    const now = Date.now()

    const insertFile = db.prepare("INSERT OR REPLACE INTO files (path, last_indexed) VALUES (?, ?) RETURNING id")
    
    db.transaction(() => {
      for (const file of files) {
        if (file.includes(".opencode") || file.includes(".git") || file.includes("node_modules")) continue
        insertFile.get(file, now)
        // Note: For a production indexer, we would parse TS/JS symbols here.
        // For MVP, we rely on the file paths and FTS grep.
      }
    })()

    log.info(`Indexed ${files.length} files.`)
    db.close()
  }

  export async function searchFiles(query: string, limit: number = 20) {
    const db = await init()
    const stmt = db.prepare("SELECT path FROM files WHERE path LIKE ? LIMIT ?")
    const results = stmt.all(`%${query}%`, limit) as { path: string }[]
    db.close()
    return results.map(r => r.path)
  }
}
