import { Log } from "../../util/log"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"

export interface FailureEntry {
  timestamp: string
  sessionID: string
  taskGoal: string
  failureType: string
  errorMessage: string
  resolutionAttempted?: string
}

/**
 * FailureStore: P8 — Cross-session failure learning and heuristics feedback.
 * Maintains a journal of what went wrong to avoid repeating mistakes.
 */
export class FailureStore {
  private static log = Log.create({ service: "failure-store" })
  private static JOURNAL_PATH = ".opencode/intelligence/failure_journal.jsonl"

  static getPolicy(): string {
    return [
      `<learning_policy>`,
      `  Failure Journal: Your mistakes are being recorded to help future sessions avoid the same pitfalls.`,
      `  Heuristics Feedback: Before starting a complex task, check the failure journal for similar past failures in this repo.`,
      `  Anti-Pattern Detection: If a specific tool pattern has failed 3+ times across different sessions, do not use it again.`,
      `</learning_policy>`
    ].join("\n")
  }

  static async logFailure(entry: FailureEntry): Promise<void> {
    const dir = join(process.cwd(), ".opencode/intelligence")
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    
    const line = JSON.stringify(entry) + "\n"
    await Bun.write(this.JOURNAL_PATH, line, { append: true })
    this.log.info("failure logged and learned", entry)
  }

  static async getRelevantFailures(keyword: string): Promise<FailureEntry[]> {
    const file = Bun.file(this.JOURNAL_PATH)
    if (!(await file.exists())) return []
    
    const content = await file.text()
    return content.split("\n")
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .filter(entry => entry.taskGoal.toLowerCase().includes(keyword.toLowerCase()))
  }
}
