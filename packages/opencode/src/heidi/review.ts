import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"

const log = Log.create({ service: "heidi-review" })

export namespace HeidiReview {
  export type Finding = {
    file: string
    line: number
    content: string
    reason: string
  }

  /**
   * Performs an autonomous "vibe check" on changed files to detect
   * common AI-agent anti-patterns using pure TypeScript regex.
   */
  export async function audit(files: string[]): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const file of files) {
      try {
        const content = await Filesystem.readText(file)
        log.info("Auditing file", { file, contentLen: content.length })
        const lines = content.split("\n")

        // 1. Floating Promise Check
        const services = ["fetch", "spawn", "Filesystem.", "Session.", "HeidiState."]
        for (let i = 0; i < lines.length; i++) {
          const rawLine = lines[i]
          const line = rawLine.trim()
          if (!line) continue

          // Remove comments for the 'await' check to avoid false negatives
          const codeOnly = line.split("//")[0].split("/*")[0].trim()
          const hasService = services.some(s => codeOnly.includes(s))
          const hasAwait = codeOnly.includes("await") || codeOnly.includes("return") || codeOnly.includes("void")
          
          if (hasService && !hasAwait) {
            log.info("Found finding", { file, line: i + 1, content: line })
            findings.push({
              file,
              line: i + 1,
              content: line,
              reason: "Floating promise: This mission-critical call is not awaited or explicitly voided. This can cause race conditions or state desync."
            })
          }
        }

        // 2. SSE Resource Leak Check (Multiline)
        const sseLeakPattern = /\.onAbort\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g
        let match: RegExpExecArray | null
        while ((match = sseLeakPattern.exec(content)) !== null) {
          const block = match[1]
          const codeOnlyBlock = block.split("\n").map(line => line.split("//")[0].split("/*")[0]).join("\n")
          if (!codeOnlyBlock.includes("stop()") && !codeOnlyBlock.includes("cleanup()")) {
            // Find line number of the match
            const offset = match.index
            const lineNum = content.substring(0, offset).split("\n").length
            findings.push({
              file,
              line: lineNum,
              content: content.substring(offset, offset + 50).split("\n")[0] + "...",
              reason: "SSE resource leak: onAbort handler appears to be missing a proper cleanup/stop call."
            })
          }
        }
      } catch (err) {
        log.error("Audit failed for file", { file, err })
      }
    }

    return findings
  }

  export function formatAdvice(findings: Finding[]): string {
    if (findings.length === 0) return ""

    const lines = [
        "### 🤖 Heidi Peer-Review Advice",
        "I noticed some potential issues in your recent changes that might lead to instability:",
        ""
    ]

    for (const f of findings) {
        lines.push(`- **${f.file.split('/').pop()}:${f.line}**: \`${f.content}\``)
        lines.push(`  > [!WARNING]`)
        lines.push(`  > ${f.reason}`)
        lines.push("")
    }

    lines.push("Please review and address these points in your next step to ensure 100/100 system reliability.")

    return lines.join("\n")
  }
}
