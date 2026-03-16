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
      if (m.latencyMs.length > 300) m.latencyMs.shift()

      if (status >= 500) m.status5xx += 1
      else if (status >= 400) m.status4xx += 1
    },
    fail() {
      m.activeRequests = Math.max(0, m.activeRequests - 1)
      m.errorCount += 1

      const dur = performance.now() - started
      m.latencyMs.push(dur)
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

function fmtSec(n: number): string {
  if (n < 60) return `${Math.floor(n)}s`
  const m = Math.floor(n / 60)
  const s = Math.floor(n % 60)
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
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

function healthSummary(m: DashboardMetrics) {
  const mem = process.memoryUsage()
  const cpus = Math.max(1, os.cpus().length)
  const [l1] = os.loadavg()

  const warnings: string[] = []
  if (m.lastHealthOK === false) warnings.push("health probe failed")
  if (l1 > cpus) warnings.push(`CPU load ${l1.toFixed(2)} > ${cpus} cores`)
  if (mem.rss > 1024 * 1024 * 1024) warnings.push(`RSS high: ${fmtBytes(mem.rss)}`)
  if (p95(m.latencyMs) > 1500) warnings.push(`p95 latency high: ${p95(m.latencyMs).toFixed(0)} ms`)
  if (m.activeRequests > 100) warnings.push(`active requests high: ${m.activeRequests}`)

  return {
    state: warnings.length === 0 ? "HEALTHY" : "DEGRADED",
    warnings,
  }
}

async function probeHealth(baseUrl: string, path: string, m: DashboardMetrics) {
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: "GET" })
    m.lastHealthOK = res.ok
    m.lastHealthText = `${res.status} ${res.statusText}`
  } catch (err) {
    m.lastHealthOK = false
    m.lastHealthText = err instanceof Error ? err.message : "probe failed"
  }
}

function line(label: string, value: string) {
  return `  ${label.padEnd(18)} ${value}`
}

function render(
  server: { port: number },
  opts: Required<DashboardOpts>,
  m: DashboardMetrics,
): string {
  const host = opts.hostname === "0.0.0.0" ? "localhost" : opts.hostname
  const base = `http://${host}:${server.port}`
  const mem = process.memoryUsage()
  const [l1, l5, l15] = os.loadavg()
  const up = (Date.now() - m.startedAt) / 1000
  const health = healthSummary(m)
  const ips = opts.hostname === "0.0.0.0" ? getNetworkIPs() : []
  const statusDot = health.state === "HEALTHY" ? "●" : "▲"

  const rows: string[] = []
  rows.push("")
  rows.push(`  ${statusDot} ${opts.title}`)
  rows.push(line("Status", `${health.state}${m.lastHealthOK === null ? "" : `  (${m.lastHealthText})`}`))
  rows.push(line("Bind", `${opts.hostname}:${server.port}`))
  rows.push(line("Health", `${base}${opts.healthPath}`))
  rows.push(line("PID", String(process.pid)))
  rows.push(line("Uptime", fmtSec(up)))
  rows.push(line("CPU load", `${l1.toFixed(2)} / ${l5.toFixed(2)} / ${l15.toFixed(2)}`))
  rows.push(line("RSS", fmtBytes(mem.rss)))
  rows.push(line("Heap", `${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}`))
  rows.push(line("Requests", String(m.totalRequests)))
  rows.push(line("Active req", String(m.activeRequests)))
  rows.push(line("4xx / 5xx", `${m.status4xx} / ${m.status5xx}`))
  rows.push(line("Errors", String(m.errorCount)))
  rows.push(line("Avg / p95", `${avg(m.latencyMs).toFixed(0)} ms / ${p95(m.latencyMs).toFixed(0)} ms`))
  rows.push(line("Active SSE", String(m.activeStreams)))
  rows.push(line("Reconnects", String(m.reconnectCount)))
  rows.push(line("Runtime", typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Node " + process.version))
  rows.push(line("Env", process.env.NODE_ENV || "development"))
  rows.push("")

  rows.push(line("Local access", `http://localhost:${server.port}`))
  for (const ip of ips) rows.push(line("Network access", `http://${ip}:${server.port}`))

  if (health.warnings.length) {
    rows.push("")
    rows.push("  Performance notes")
    for (const w of health.warnings) rows.push(`   - ${w}`)
  }

  rows.push("")
  return rows.join("\n")
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
    refreshMs: opts.refreshMs ?? 1500,
    title: opts.title ?? "OpenCode Server Dashboard",
  }

  const tty = Boolean(process.stdout.isTTY)
  const host = cfg.hostname === "0.0.0.0" ? "localhost" : cfg.hostname
  const base = `http://${host}:${server.port}`
  let stopped = false

  async function tick() {
    await probeHealth(base, cfg.healthPath, metrics)
    const out = render(server, cfg, metrics)

    if (tty) {
      process.stdout.write("\x1b[2J\x1b[H")
      process.stdout.write(out)
    } else {
      console.log(out)
    }
  }

  void tick()
  const id = setInterval(() => {
    if (!stopped) void tick()
  }, cfg.refreshMs)

  return {
    stop() {
      stopped = true
      clearInterval(id)
    },
    refresh() {
      return tick()
    },
  }
}
