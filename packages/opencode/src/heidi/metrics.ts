import { Log } from "@/util/log"

const log = Log.create({ service: "heidi.metrics" })

export namespace HeidiMetrics {
  export interface MetricEntry {
    session_id: string
    timestamp: number
    tokens_in: number
    tokens_out: number
    latency_ms: number
    cost_usd: number
    model: string
  }

  const store: MetricEntry[] = []

  export function record(entry: Omit<MetricEntry, "timestamp">) {
    const m: MetricEntry = { ...entry, timestamp: Date.now() }
    store.push(m)
    log.info("metric recorded", m)
  }

  export function summary(sessionId?: string) {
    const target = sessionId ? store.filter((m) => m.session_id === sessionId) : store
    if (target.length === 0) return null

    const totalIn = target.reduce((s, m) => s + m.tokens_in, 0)
    const totalOut = target.reduce((s, m) => s + m.tokens_out, 0)
    const totalCost = target.reduce((s, m) => s + m.cost_usd, 0)
    const avgLatency = target.reduce((s, m) => s + m.latency_ms, 0) / target.length

    return {
      total_in: totalIn,
      total_out: totalOut,
      total_cost_usd: totalCost,
      avg_latency_ms: avgLatency,
      calls: target.length,
    }
  }

  export function exportJson(): string {
    return JSON.stringify(store, null, 2)
  }
}
