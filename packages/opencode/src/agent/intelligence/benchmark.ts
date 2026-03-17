import { Log } from "../../util/log"

export interface BenchmarkMetrics {
  success_rate: number
  avg_tokens: number
  avg_step_count: number
  lint_score: number
}

/**
 * BenchmarkGate: P9 — metric scoring harness and regression release gate.
 * Ensures that the agent's behavior meets minimum performance bars.
 */
export class BenchmarkGate {
  private static log = Log.create({ service: "benchmark-gate" })

  static getPolicy(): string {
    return [
      `<benchmark_policy>`,
      `  Performance Gate: Each task run is scored against baseline metrics (Success Rate, Steps, Token Efficiency).`,
      `  Regression Control: If your current trajectory exceeds 2x the baseline step count, pause and re-plan.`,
      `  Lint Guard: All code contributions must achieve a 100/100 lint score before the task is considered complete.`,
      `</benchmark_policy>`
    ].join("\n")
  }

  static getMetricsHint(): string {
    return "Optimize for: Minimal steps, zero lint errors, and evidence-first verification."
  }
}
