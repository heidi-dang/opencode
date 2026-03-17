import { Log } from "../../util/log"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"

/**
 * RunMemory: P7 — Persistent run state for crash-safe execution.
 * Handles saving and loading the agent's current state to disk.
 */
export class RunMemory {
  private static log = Log.create({ service: "run-memory" })
  private static STORAGE_DIR = ".opencode/run"

  static getPolicy(): string {
    return [
      `<persistence_policy>`,
      `  Crash-Safe: Your current task state, working set summary, and recovery attempts are being persisted to ${this.STORAGE_DIR}.`,
      `  Resume Logic: If you detect a previous run for this sessionID, summarize the last known state before proceeding.`,
      `  Checkpointing: After any meaningful file edit or successful tool run, a checkpoint is saved.`,
      `</persistence_policy>`
    ].join("\n")
  }

  static async saveCheckpoint(sessionID: string, state: any): Promise<void> {
    const dir = join(process.cwd(), this.STORAGE_DIR)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    
    const path = join(dir, `${sessionID}.json`)
    await Bun.write(path, JSON.stringify(state, null, 2))
    this.log.info("checkpoint saved", { sessionID, path })
  }

  static async loadCheckpoint(sessionID: string): Promise<any | null> {
    const path = join(process.cwd(), this.STORAGE_DIR, `${sessionID}.json`)
    const file = Bun.file(path)
    if (await file.exists()) {
      return await file.json()
    }
    return null
  }
}
