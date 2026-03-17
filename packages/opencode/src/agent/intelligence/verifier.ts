import { Log } from "../../util/log"

/**
 * EvidenceVerifier: P5 — Evidence-first validation and regression assessment.
 * Ensures the agent doesn't just "say" it's done, but provides verifiable proof.
 */
export class EvidenceVerifier {
  private static log = Log.create({ service: "evidence-verifier" })

  static getPolicy(): string {
    return [
      `<verification_policy>`,
      `  Evidence-First: Every 'complete' status must be accompanied by specific evidence (tool output snippets, screenshots, or file paths).`,
      `  Untrusted First Output: Treat your first successful-looking result as a candidate only. Verify it with a secondary tool if possible.`,
      `  Regression Assessment: Before finishing, explicitly check if your changes broke any related functionality (run tests or lint).`,
      `</verification_policy>`
    ].join("\n")
  }

  static getEvidenceHint(requiredEvidence: string[]): string {
    if (requiredEvidence.length === 0) return ""
    return [
      `<required_evidence_check>`,
      `  You must provide proof for:`,
      ...requiredEvidence.map(e => `  - ${e}`),
      `</required_evidence_check>`
    ].join("\n")
  }
}
