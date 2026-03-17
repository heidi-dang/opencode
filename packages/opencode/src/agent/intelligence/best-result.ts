import { Log } from "../../util/log"

/**
 * BestResultEngine: P10 — Quality rubric builder and result scorer.
 * The final gate that decides if the work is truly "Human-Like" and complete.
 */
export class BestResultEngine {
  private static log = Log.create({ service: "best-result-engine" })

  static getPolicy(): string {
    return [
      `<quality_policy>`,
      `  Excellence Standard: Do not settle for "functional". Aim for "premium".`,
      `  Dissatisfaction Signal: If the user's request is satisfied but the code is messy, refactor before finishing.`,
      `  Bounded Stop: If you have attempted the same fix 3 times without success, escalate to the user with a detailed gap analysis instead of trying a 4th time.`,
      `  Rubric:`,
      `    1. Does it solve the user's primary goal?`,
      `    2. Is it verified by evidence (logs/screenshots)?`,
      `    3. Is the code clean and following the repo's style guide?`,
      `    4. Are there any new regressions?`,
      `</quality_policy>`
    ].join("\n")
  }

  static getEncouragement(): string {
    return "You are an Elite Engineer. Deliver a 10/10 result."
  }
}
