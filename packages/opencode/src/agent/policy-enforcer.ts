import { HeidiState } from "../heidi/state"
import { SessionID } from "../session/schema"

export namespace PolicyEnforcer {
  export interface PolicyViolation {
    file: string
    line: number
    rule: string
    severity: "high" | "medium" | "low"
    description: string
  }

  const secretPatterns = [
    /password\s*=\s*["\']?[\w!@#$%^&*()_+\-=\[\]{};:\x22|,.<>/?]+["\']?/i,
    /secret\s*=\s*["\']?[\w!@#$%^&*()_+\-=\[\]{};:\x22|,.<>/?]+["\']?/i,
    /api[_-]?key\s*=\s*["\']?[\w\-]+["\']?/i,
    /PRIVATE[_-]?KEY\s*=\s*["\']?[\w\-]+["\']?/i,
    /const\s+\w*(token|secret|password)\w*\s*=\s*["\']/i,
  ]

  export async function scanFile(filePath: string, content: string): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = []
    const lines = content.split("\n")

    for (const [idx, line] of lines.entries()) {
      for (const pattern of secretPatterns) {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: idx + 1,
            rule: "hardcoded-secret",
            severity: "high",
            description: "Potential hardcoded secret detected",
          })
        }
      }
    }

    return violations
  }

  export async function checkSession(sessionID: SessionID): Promise<{
    passed: boolean
    violations: PolicyViolation[]
  }> {
    const state = await HeidiState.read(sessionID)
    const files = state.changed_files || []

    const results = await Promise.all(
      files.map(async (file) => {
        // In real impl, read file content
        return scanFile(file, "// mock content")
      }),
    )

    const violations = results.flat()
    return {
      passed: violations.length === 0,
      violations,
    }
  }
}
