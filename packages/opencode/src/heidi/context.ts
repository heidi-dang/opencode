import { createHash } from "crypto"
import path from "path"
import fs from "fs/promises"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { SessionID } from "@/session/schema"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { HeidiState } from "./state"
import { ContextState, SyncStatus } from "./schema"
import { HeidiMemory } from "./memory"
import { HeidiTelemetry } from "./telemetry"

function root(sessionID: SessionID) {
  try {
    if (Instance.project.vcs) return path.join(Instance.worktree, ".opencode", "heidi", sessionID)
  } catch {}
  return path.join(Global.Path.state, "heidi", sessionID)
}

function file(sessionID: SessionID) {
  return path.join(root(sessionID), "context.json")
}

function knowledgeFile(sessionID: SessionID) {
  return path.join(root(sessionID), "knowledge.jsonl")
}

function quote(text: string) {
  return JSON.stringify(text)
}

function clip(text: string, len = 400) {
  return text.length > len ? text.slice(0, len) + "…" : text
}

function sig(...parts: string[]) {
  return createHash("sha256").update(parts.join("\n--\n")).digest("hex")
}

function text(msg: MessageV2.WithParts) {
  return msg.parts
    .filter((part): part is MessageV2.TextPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
}

function summary(msgs: MessageV2.WithParts[]) {
  const compact = msgs.findLast((msg) => msg.info.role === "assistant" && msg.info.summary)
  if (!compact) return { title: null, body: null, files: [] as string[] }
  const body = text(compact)
  return {
    title: compact.info.agent || null,
    body: body || null,
    files: Array.from(new Set(body.match(/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|md|json)/g) ?? [])).slice(0, 20),
  }
}

function safe(text: string) {
  const bad = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /-----BEGIN/i,
    /-----END/i,
    /aws[_-]?access[_-]?key/i,
    /bearer\s+[a-zA-Z0-9_\-]{20,}/i,
    /sk[_-]?[a-zA-Z0-9_\-]{20,}/i,
    /[A-Za-z0-9+/]{40,}[A-Za-z0-9+/=\s]{10,}[A-Za-z0-9+/]{40,}/,
  ]
  return bad.some((pat) => pat.test(text)) ? undefined : clip(text)
}

async function retrieval(sessionID: SessionID) {
  const raw = await Filesystem.readText(knowledgeFile(sessionID)).catch((err) => {
    HeidiTelemetry.debug(sessionID, "context.retrieval")
    return ""
  })
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const item = JSON.parse(line) as { kind?: unknown; summary?: unknown; source?: unknown }
        if (typeof item.summary !== "string" || typeof item.source !== "string") return []
        const summary = safe(item.summary)
        const source = safe(item.source)
        if (!summary || !source) return []
        return [{ kind: typeof item.kind === "string" ? item.kind : "unknown", summary, source }]
      } catch {
        return []
      }
    })
    .slice(0, 10)
  return {
    rows,
    fingerprint: sig(...rows.map((item) => `${item.kind}|${item.summary}|${item.source}`)),
  }
}

export namespace HeidiContext {
  export function pathFor(sessionID: SessionID) {
    return file(sessionID)
  }

  export function knowledgePath(sessionID: SessionID) {
    return knowledgeFile(sessionID)
  }

  export async function build(sessionID: SessionID) {
    const [state, msgs, memory, notes, verify] = await Promise.all([
      HeidiState.read(sessionID),
      Session.messages({ sessionID, limit: 200 }).catch((err) => {
        HeidiTelemetry.warn(sessionID, "context.build.messages", err)
        return []
      }),
      HeidiMemory.query("", "both"),
      retrieval(sessionID),
      HeidiState.readVerification(sessionID),
    ])
    const recent = memory
      .filter((item) => item.trust !== "unsafe" && item.session_id === sessionID)
      .slice(0, 8)
      .map((item) => ({
        scope: item.scope ?? "project",
        type: item.type,
        key: item.key,
        content: clip(item.content, 300),
      }))
    const sum = summary(msgs)
    return ContextState.parse({
      session_id: sessionID,
      objective: state.objective.text,
      fsm_state: state.fsm_state,
      mode: state.mode,
      plan: {
        path: state.plan.path,
        locked: state.plan.locked,
      },
      summary: sum,
      resume: {
        next_step: state.resume.next_step ?? null,
        checkpoint_id: state.resume.checkpoint_id,
        failed_hypotheses: state.resume.failed_hypotheses,
      },
      activity: {
        active_files: state.active_files,
        changed_files: state.changed_files,
        commands: state.commands.map((item) => item.cmd),
        validations: state.verification_commands,
      },
      verification: verify
        ? {
            status: verify.status,
            checks: verify.checks.map((item) => ({
              name: item.name,
              command: item.command,
              exit_code: item.exit_code,
            })),
            warnings: verify.warnings,
            remediation: verify.remediation.map((item) => ({
              file: item.file,
              line: item.line,
              rule_id: item.rule_id,
            })),
            browser: verify.browser
              ? {
                  required: verify.browser.required,
                  status: verify.browser.status,
                  console_errors: verify.browser.console_errors.length,
                  network_failures: verify.browser.network_failures.length,
                }
              : null,
          }
        : null,
      memory: {
        long_term: recent,
        retrieval: notes.rows,
      },
      freshness: {
        fingerprint: sig(
          JSON.stringify(state),
          JSON.stringify(sum),
          JSON.stringify(recent),
          JSON.stringify(notes.rows),
          JSON.stringify(verify ?? null),
        ),
        sources: {
          task: state.last_successful_step || "init",
          verification: verify ? verify.status : "missing",
          knowledge: notes.fingerprint,
          messages: String(msgs.length),
          memory: String(recent.length),
        },
      },
      sync_status: {
        status: "ok" as SyncStatus,
        last_sync_at: new Date().toISOString(),
        attempts: 1,
        last_error: null,
      },
      version: 2,
      updated_at: new Date().toISOString(),
    })
  }

  async function writeWithRetry(
    sessionID: SessionID,
    data: ContextState,
    attempts = 0,
  ): Promise<{ status: SyncStatus; attempts: number; last_error: string | null }> {
    const MAX_ATTEMPTS = 3
    const baseDelay = 100
    const target = file(sessionID)
    const tmp = target + ".tmp"

    try {
      await Filesystem.writeJson(tmp, data)
      await fs.rename(tmp, target)
      return { status: "ok", attempts: attempts + 1, last_error: null }
    } catch (err) {
      if (attempts + 1 >= MAX_ATTEMPTS) {
        HeidiTelemetry.error(sessionID, "context.write", err, attempts + 1)
        try {
          await Filesystem.writeJson(tmp, data)
          await fs.rename(tmp, target)
        } catch {}
        return {
          status: "failed",
          attempts: attempts + 1,
          last_error: err instanceof Error ? err.message : String(err),
        }
      }
      const delay = baseDelay * Math.pow(2, attempts)
      await new Promise((r) => setTimeout(r, delay))
      return writeWithRetry(sessionID, data, attempts + 1)
    }
  }

  export async function write(sessionID: SessionID) {
    const ctx = await build(sessionID)
    const syncResult = await writeWithRetry(sessionID, ctx)
    const resultCtx = {
      ...ctx,
      sync_status: {
        status: syncResult.attempts > 1 ? "degraded" : syncResult.status,
        last_sync_at: new Date().toISOString(),
        attempts: syncResult.attempts,
        last_error: syncResult.last_error,
      },
    }
    if (syncResult.status === "ok" && syncResult.attempts === 1) {
      return resultCtx
    }
    if (syncResult.status === "ok") {
      await Filesystem.writeJson(file(sessionID), resultCtx)
    }
    return resultCtx
  }

  export async function read(sessionID: SessionID) {
    return ContextState.parse(await Filesystem.readJson(file(sessionID)))
  }

  export async function sync(sessionID: SessionID) {
    return write(sessionID)
  }

  export async function current(sessionID: SessionID) {
    const ctx = await build(sessionID)
    await Filesystem.writeJson(file(sessionID), ctx)
    return ctx
  }

  export async function system(sessionID: SessionID) {
    const ctx = await current(sessionID).catch((err) => {
      HeidiTelemetry.debug(sessionID, "context.system")
      return undefined
    })
    if (!ctx) return ""
    return [
      "Current session context:",
      "<session_context>",
      `  objective: ${quote(ctx.objective || "")}`,
      `  state: ${quote(`${ctx.fsm_state} (${ctx.mode})`)}`,
      `  next_step: ${quote(ctx.resume.next_step ?? "none")}`,
      ctx.summary.body ? `  summary: ${quote(clip(ctx.summary.body, 600))}` : "",
      ctx.summary.files.length ? `  files: ${quote(ctx.summary.files.join(", "))}` : "",
      ctx.activity.active_files.length ? `  active_files: ${quote(ctx.activity.active_files.join(", "))}` : "",
      ctx.activity.changed_files.length ? `  changed_files: ${quote(ctx.activity.changed_files.join(", "))}` : "",
      ctx.verification
        ? `  verification: ${quote(`${ctx.verification.status} / ${ctx.verification.checks.length} checks`)}`
        : "",
      ctx.memory.retrieval.length
        ? `  retrieval: ${quote(ctx.memory.retrieval.map((item) => `${item.kind}:${item.summary} (${item.source})`).join(" | "))}`
        : "",
      "</session_context>",
    ]
      .filter(Boolean)
      .join("\n")
  }
}
