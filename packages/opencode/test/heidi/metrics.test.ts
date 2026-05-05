import { describe, test, expect } from "bun:test"
import { HeidiMetrics } from "@/heidi/metrics"

describe("HeidiMetrics", () => {
  test("should record metrics", () => {
    HeidiMetrics.record({
      session_id: "test-1",
      tokens_in: 100,
      tokens_out: 50,
      latency_ms: 500,
      cost_usd: 0.05,
      model: "gpt-4",
    })

    const s = HeidiMetrics.summary()
    expect(s).not.toBeNull()
    expect(s!.calls).toBeGreaterThan(0)
  })

  test("should summarize correctly", () => {
    HeidiMetrics.record({
      session_id: "test-2",
      tokens_in: 200,
      tokens_out: 100,
      latency_ms: 300,
      cost_usd: 0.1,
      model: "gpt-4",
    })

    const s = HeidiMetrics.summary("test-2")
    expect(s).not.toBeNull()
    expect(s!.total_in).toBe(200)
    expect(s!.total_out).toBe(100)
  })

  test("should export json", () => {
    const json = HeidiMetrics.exportJson()
    expect(json).toContain("session_id")
  })
})
