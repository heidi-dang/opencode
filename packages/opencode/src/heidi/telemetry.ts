/**
 * Structured telemetry for heidi context operations.
 * Logs to console.error by default. Set HEIDI_TELEMETRY env var to a
 * custom function: JSON.stringify({level, ctx, err}) will be passed to it.
 */
export namespace HeidiTelemetry {
  export type Level = "debug" | "info" | "warn" | "error"

  export type Event = {
    level: Level
    ctx: {
      session_id: string
      operation: string
      attempt?: number
      duration_ms?: number
    }
    err?: {
      message: string
      stack?: string
    }
  }

  let sink: ((event: string) => void) | null = null

  export function configure(fn: (event: string) => void) {
    sink = fn
  }

  function emit(level: Level, ctx: Event["ctx"], err?: unknown) {
    const event: Event = {
      level,
      ctx,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : err ? { message: String(err) } : undefined,
    }
    const serialized = JSON.stringify(event)
    if (sink) {
      try { sink(serialized) } catch {}
    } else if (level === "error" || level === "warn") {
      console.error("[heidi.telemetry]", serialized)
    }
  }

  export function error(sessionID: string, operation: string, err: unknown, attempt?: number) {
    emit("error", { session_id: sessionID, operation, attempt })
  }

  export function warn(sessionID: string, operation: string, err?: unknown) {
    emit("warn", { session_id: sessionID, operation })
  }

  export function info(sessionID: string, operation: string) {
    emit("info", { session_id: sessionID, operation })
  }

  export function debug(sessionID: string, operation: string) {
    emit("debug", { session_id: sessionID, operation })
  }
}
