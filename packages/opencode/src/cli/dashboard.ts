import os from "node:os"
import { UI } from "./ui"

type DashboardOpts = {
  hostname: string
  port?: number
  healthPath?: string
  refreshMs?: number
  title?: string
}

export type DashboardMetrics = {
  startedAt: number
  totalRequests: number
  activeRequests: number
  errorCount: number
  status5xx: number
  status4xx: number
  latencyMs: number[]
  maxLatencyMs: number
  activeStreams: number
  reconnectCount: number
  lastHealthOK: boolean | null
  lastHealthText: string
}

export function createDashboardMetrics(): DashboardMetrics {
  return {
    startedAt: Date.now(),
    totalRequests: 0,
    activeRequests: 0,
    errorCount: 0,
    status5xx: 0,
    status4xx: 0,
    latencyMs: [],
    maxLatencyMs: 0,
    activeStreams: 0,
    reconnectCount: 0,
    lastHealthOK: null,
    lastHealthText: "pending",
  }
}

export function recordRequestStart(m: DashboardMetrics) {
  m.totalRequests += 1
  m.activeRequests += 1
  const started = performance.now()

  return {
    finish(status: number) {
      m.activeRequests = Math.max(0, m.activeRequests - 1)
      const dur = performance.now() - started
      m.latencyMs.push(dur)
      if (dur > m.maxLatencyMs) m.maxLatencyMs = dur
      if (m.latencyMs.length > 300) m.latencyMs.shift()

      if (status >= 500) m.status5xx += 1
      else if (status >= 400) m.status4xx += 1
    },
    fail() {
      m.activeRequests = Math.max(0, m.activeRequests - 1)
      m.errorCount += 1
      const dur = performance.now() - started
      m.latencyMs.push(dur)
      if (dur > m.maxLatencyMs) m.maxLatencyMs = dur
      if (m.latencyMs.length > 300) m.latencyMs.shift()
    },
  }
}

export function streamOpened(m: DashboardMetrics) {
  m.activeStreams += 1
  return () => {
    m.activeStreams = Math.max(0, m.activeStreams - 1)
  }
}

export function streamReconnect(m: DashboardMetrics) {
  m.reconnectCount += 1
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtUptime(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) return `${min}m ${remSec}s`
  const hr = Math.floor(min / 60)
  return `${hr}h ${min % 60}m`
}

function avg(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function p95(xs: number[]): number {
  if (!xs.length) return 0
  const ys = [...xs].sort((a, b) => a - b)
  const idx = Math.min(ys.length - 1, Math.floor(ys.length * 0.95))
  return ys[idx] ?? 0
}

function getNetworkIPs(): string[] {
  const out: string[] = []
  const nets = os.networkInterfaces()
  for (const list of Object.values(nets)) {
    for (const item of list ?? []) {
      if (item.family === "IPv4" && !item.internal) out.push(item.address)
    }
  }
  return out
}

function style(name: string, fallback = ""): string {
  return (UI.Style as Record<string, string>)[name] ?? fallback
}

function healthState(m: DashboardMetrics) {
  const mem = process.memoryUsage()
  const cpus = Math.max(1, os.cpus().length)
  const [l1] = os.loadavg()

  const warns: string[] = []
  if (m.lastHealthOK === false) warns.push(`health probe failed: ${m.lastHealthText}`)
  if (l1 > cpus) warns.push(`cpu load high: ${l1.toFixed(2)} > ${cpus} cores`)
  if (mem.rss > 1024 * 1024 * 1024) warns.push(`rss high: ${fmtBytes(mem.rss)}`)
  if (p95(m.latencyMs) > 1500) warns.push(`p95 latency high: ${p95(m.latencyMs).toFixed(0)} ms`)
  if (m.activeRequests > 100) warns.push(`active requests high: ${m.activeRequests}`)

  return {
    state: warns.length === 0 ? "HEALTHY" : "DEGRADED",
    warns,
  }
}

async function probeHealth(baseUrl: string, path: string, m: DashboardMetrics) {
  try {
    const res = await fetch(`${baseUrl}${path}`)
    m.lastHealthOK = res.ok
    m.lastHealthText = `${res.status} ${res.statusText}`
  } catch (err) {
    m.lastHealthOK = false
    m.lastHealthText = err instanceof Error ? err.message : "probe failed"
  }
}

function line(label: string, value: string) {
  return [
    style("TEXT_INFO_BOLD"),
    `  ${label.padEnd(18)} `,
    style("TEXT_NORMAL"),
    value,
  ]
}

function render(
  server: { port: number },
  opts: Required<DashboardOpts>,
  m: DashboardMetrics
): string[][] {
  const host = opts.hostname === "0.0.0.0" ? "localhost" : opts.hostname
  const base = `http://${host}:${server.port}`
  const mem = process.memoryUsage()
  const [l1, l5, l15] = os.loadavg()
  const up = Date.now() - m.startedAt
  const hs = healthState(m)
  const ips = opts.hostname === "0.0.0.0" ? getNetworkIPs() : []

  const okStyle = style("TEXT_SUCCESS_BOLD", style("TEXT_INFO_BOLD"))
  const warnStyle = style("TEXT_WARNING_BOLD", style("TEXT_INFO_BOLD"))
  const headStyle = hs.state === "HEALTHY" ? okStyle : warnStyle

  const rows: string[][] = []
  rows.push([style("TEXT_INFO_BOLD"), UI.logo("  ")])
  rows.push([headStyle, `  ● ${opts.title}`])
  rows.push([
    headStyle,
    "  Status             ",
    style("TEXT_NORMAL"),
    `${hs.state}${m.lastHealthOK === null ? "" : ` (${m.lastHealthText})`}`,
  ])

  rows.push(line("Bind", `${opts.hostname}:${server.port}`))
  rows.push(line("Health", `${base}${opts.healthPath}`))
  rows.push(line("PID", String(process.pid)))
  rows.push(line("Uptime", fmtUptime(up)))
  rows.push(line("CPU load", `${l1.toFixed(2)} / ${l5.toFixed(2)} / ${l15.toFixed(2)}`))
  rows.push(line("RSS", fmtBytes(mem.rss)))
  rows.push(line("Heap", `${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}`))
  rows.push(line("Requests", String(m.totalRequests)))
  rows.push(line("Active req", String(m.activeRequests)))
  rows.push(line("4xx / 5xx", `${m.status4xx} / ${m.status5xx}`))
  rows.push(line("Errors", String(m.errorCount)))
  rows.push(line("Avg / p95 / Max", `${avg(m.latencyMs).toFixed(0)} ms / ${p95(m.latencyMs).toFixed(0)} ms / ${m.maxLatencyMs.toFixed(0)} ms`))
  rows.push(line("Active SSE", String(m.activeStreams)))
  rows.push(line("Reconnects", String(m.reconnectCount)))
  rows.push(line("Runtime", typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "unknown"))
  rows.push(line("Env", process.env.NODE_ENV || "development"))

  rows.push(line("Local access", `http://localhost:${server.port}`))
  for (const ip of ips) {
    rows.push(line("Network access", `http://${ip}:${server.port}`))
  }

  if (hs.warns.length > 0) {
    rows.push([warnStyle, "  Performance notes"])
    for (const w of hs.warns) {
      rows.push([warnStyle, "   - ", style("TEXT_NORMAL"), w])
    }
  }

  return rows
}

function draw(rows: string[][]) {
  if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H")
  for (const row of rows) UI.println(...row)
}

export function attachServerDashboard(
  server: { port: number },
  opts: DashboardOpts,
  metrics: DashboardMetrics,
) {
  const cfg: Required<DashboardOpts> = {
    hostname: opts.hostname,
    port: opts.port ?? server.port,
    healthPath: opts.healthPath ?? "/health",
    title: opts.title ?? "OpenCode Server Dashboard",
    refreshMs: opts.refreshMs ?? 1500,
  }

  const host = cfg.hostname === "0.0.0.0" ? "localhost" : cfg.hostname
  const base = `http://${host}:${server.port}`
  let stopped = false

  async function tick() {
    await probeHealth(base, cfg.healthPath, metrics)
    draw(render(server, cfg, metrics))
  }

  void tick()
  const timer = setInterval(() => {
    if (!stopped) void tick()
  }, cfg.refreshMs)

  return {
    async refresh() {
      await tick()
    },
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
