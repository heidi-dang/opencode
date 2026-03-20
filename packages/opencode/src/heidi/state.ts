import { createHash } from "crypto"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Identifier } from "@/id/id"
import { SessionID } from "@/session/schema"
import { TaskState, VerifyState, ResumeState } from "./schema"
import { Instance } from "@/project/instance"
import { HeidiContext } from "./context"
import { Tool } from "@/tool/tool"
import { Log } from "@/util/log"

const StateMode = {
  IDLE: "PLANNING",
  DISCOVERY: "PLANNING",
  PLAN_DRAFT: "PLANNING",
  PLAN_LOCKED: "PLANNING",
  EXECUTION: "EXECUTION",
  VERIFICATION: "VERIFICATION",
  COMPLETE: "VERIFICATION",
  BLOCKED: "PLANNING",
} as const satisfies Record<TaskState["fsm_state"], TaskState["mode"]>

const log = Log.create({ service: "heidi.state" })

const PLAN_SECTIONS = [
  "Background and discovered repo facts",
  "Scope",
  "Files to modify",
  "Change strategy by component",
  "Verification plan",
] as const

function root(sessionID: SessionID) {
  try {
    if (Instance.project.vcs) return path.join(Instance.worktree, ".opencode", "heidi", sessionID)
  } catch {}
  return path.join(Global.Path.state, "heidi", sessionID)
}

function taskPath(sessionID: SessionID) {
  return path.join(root(sessionID), "task.json")
}

function taskMdPath(sessionID: SessionID) {
  return path.join(root(sessionID), "task.md")
}

function verifyPath(sessionID: SessionID) {
  return path.join(root(sessionID), "verification.json")
}

function resumePath(sessionID: SessionID) {
  return path.join(root(sessionID), "resume.json")
}

function planPath(sessionID: SessionID) {
  return path.join(root(sessionID), "implementation_plan.md")
}

function contextPath(sessionID: SessionID) {
  return path.join(root(sessionID), "context.json")
}

function verifySync(state: TaskState) {
  state.mode = StateMode[state.fsm_state]
  if (state.fsm_state === "COMPLETE" && !state.plan.locked) {
    throw new Error("complete state requires locked plan")
  }
  if (["PLAN_LOCKED", "EXECUTION", "VERIFICATION", "COMPLETE"].includes(state.fsm_state) && !state.plan.locked) {
    throw new Error(`${state.fsm_state.toLowerCase()} requires locked plan`)
  }
  if (state.fsm_state !== "IDLE" && !state.objective.text.trim()) {
    throw new Error(`${state.fsm_state.toLowerCase()} requires objective.text`)
  }
}

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

async function syncctx(sessionID: SessionID) {
  await HeidiContext.sync(sessionID)
}

function validatePlan(text: string) {
  const issues = planIssues(text)
  if (issues.length > 0) {
    throw new Error(`Plan incomplete — the following sections are missing or contain TBD: ${issues.join(", ")}`)
  }
}

function planIssues(text: string) {
  return PLAN_SECTIONS.filter((s) => {
    const re = new RegExp(`## ${s}\\s*\\n([\\s\\S]*?)(?=##|$)`, "i")
    const match = text.match(re)
    if (!match) return true
    const body = match[1]?.trim() ?? ""
    if (!body || body === "- TBD" || body === "TBD") return true
    if (/^none$/im.test(body)) return false
    return /^\s*-?\s*TBD/im.test(body)
  })
}

function next(state: TaskState, pending: string[], ready: boolean) {
  if (state.fsm_state === "IDLE") return "start"
  if (state.fsm_state === "DISCOVERY" || state.fsm_state === "PLAN_DRAFT") {
    return ready ? "lock_plan" : "write_plan"
  }
  if (state.fsm_state === "PLAN_LOCKED") return "begin_execution"
  if (state.fsm_state === "EXECUTION") return pending.length === 0 ? "request_verification" : "EXECUTION"
  if (state.fsm_state === "VERIFICATION") return "complete"
  if (state.fsm_state === "COMPLETE") return "done"
  if (state.fsm_state === "BLOCKED") return "blocked"
  return state.resume.next_step ?? undefined
}

function parsePlan(text: string): TaskState["checklist"] {
  const items: TaskState["checklist"] = []
  const modify = text.match(/## Files to modify\s*\n([\s\S]*?)(?=##|$)/)
  if (modify) {
    for (const line of modify[1].split("\n")) {
      const m = line.match(/^\s*-\s+(.+?)\s*(?:\(Modify\))?\s*$/)
      if (m && m[1] !== "TBD" && m[1] !== "TBD (Modify)")
        items.push({
          id: `mod-${items.length}`,
          label: m[1].trim(),
          status: "todo",
          category: "Modify",
          priority: "medium",
        })
    }
  }
  const create = text.match(/## Files to create\s*\n([\s\S]*?)(?=##|$)/)
  if (create) {
    for (const line of create[1].split("\n")) {
      const m = line.match(/^\s*-\s+(.+?)\s*(?:\(New\))?\s*$/)
      if (m && m[1] !== "TBD" && m[1] !== "TBD (New)")
        items.push({
          id: `new-${items.length}`,
          label: m[1].trim(),
          status: "todo",
          category: "New",
          priority: "medium",
        })
    }
  }
  const verify = text.match(/## Verification plan\s*\n([\s\S]*?)(?=##|$)/)
  if (verify) {
    for (const line of verify[1].split("\n")) {
      const m = line.match(/^\s*-\s+(.+)$/)
      if (m && m[1] !== "TBD")
        items.push({
          id: `verify-${items.length}`,
          label: m[1].trim(),
          status: "todo",
          category: "Verify",
          priority: "medium",
        })
    }
  }
  const del = text.match(/## Files to delete\s*\n([\s\S]*?)(?=##|$)/)
  if (del) {
    for (const line of del[1].split("\n")) {
      const m = line.match(/^\s*-\s+(.+?)\s*(?:\(Delete\))?\s*$/)
      if (m && m[1] !== "TBD" && m[1] !== "TBD (Delete)")
        items.push({
          id: `del-${items.length}`,
          label: m[1].trim(),
          status: "todo",
          category: "Delete",
          priority: "medium",
        })
    }
  }
  return items
}

function priorityEmoji(p: string) {
  return p === "high" ? "🔴" : p === "medium" ? "🟡" : "🟢"
}

function render(state: TaskState) {
  const out = [] as string[]
  out.push(`# Heidi Task: ${state.task_id}`)
  out.push("")
  out.push(`> **Run ID**: \`${state.run_id}\``)
  out.push(`> **Status**: \`${state.fsm_state}\` (${state.mode})`)
  out.push(`> **Goal**: ${state.objective.text}`)
  out.push("")
  if (state.block_reason) {
    out.push(`> [!WARNING]`)
    out.push(`> **Blocked**: ${state.block_reason}`)
    out.push("")
  }
  out.push(`### Progress`)
  out.push(`- **Last Step**: ${state.last_successful_step || "None"}`)
  out.push(`- **Next Transition**: ${state.next_transition}`)
  out.push("")
  if (state.telemetry) {
    out.push("### Analytics")
    if (state.telemetry.tool_calls_count !== undefined) {
      out.push(`- **Tool Calls**: ${state.telemetry.tool_calls_count}`)
    }
    if (state.telemetry.duration_ms !== undefined) {
      const secs = (state.telemetry.duration_ms / 1000).toFixed(1)
      out.push(`- **Duration**: ${secs}s`)
    }
    if (state.telemetry.started_at) {
      out.push(`- **Started**: ${state.telemetry.started_at}`)
    }
    out.push("")
  }
  out.push("### Checklist")
  for (const cat of ["Modify", "New", "Delete", "Verify"]) {
    const items = state.checklist.filter((item) => item.category === cat)
    if (items.length === 0) continue
    out.push(`#### ${cat}`)
    out.push(
      ...items.map(
        (item) =>
          `- [${item.status === "done" ? "x" : item.status === "doing" ? "/" : " "}] ${priorityEmoji(item.priority ?? "medium")} ${item.label}`,
      ),
    )
  }
  return out.join("\n") + "\n"
}

export namespace HeidiState {
  export function plan(sessionID: SessionID) {
    return planPath(sessionID)
  }

  export async function ensure(sessionID: SessionID, objective: string) {
    if (await Filesystem.exists(taskPath(sessionID))) return await read(sessionID)
    const text = objective.trim()
    const init: TaskState = {
      run_id: Identifier.ascending("tool"),
      task_id: sessionID,
      fsm_state: "IDLE",
      mode: "PLANNING",
      objective: {
        locked: false,
        text: text,
      },
      plan: {
        path: planPath(sessionID),
        hash: "",
        locked: false,
        amendments: [],
      },
      checklist: [],
      active_files: [],
      changed_files: [],
      commands: [],
      verification_commands: [],
      checkpoints: [],
      block_reason: null,
      last_successful_step: "",
      next_transition: "DISCOVERY",
      resume: {
        next_step: "DISCOVERY",
        checkpoint_id: null,
        failed_hypotheses: [],
      },
      telemetry: {
        tool_calls_count: 0,
      },
    }
    const plan = [
      `# Implementation Plan`,
      "",
      `## Task goal`,
      text || "TBD",
      "",
      `## Background and discovered repo facts`,
      "- TBD",
      "",
      `## Scope`,
      "- TBD",
      "",
      `## Out-of-scope`,
      "- TBD",
      "",
      `## Files to modify`,
      "- TBD (Modify)",
      "",
      `## Files to create`,
      "- TBD (New)",
      "",
      `## Files not to touch`,
      "- TBD",
      "",
      `## Change strategy by component`,
      "- TBD",
      "",
      `## Risks and assumptions`,
      "- TBD",
      "",
      `## Verification plan`,
      "- TBD",
      "",
      `## Rollback expectations`,
      "- TBD",
      "",
      `## Expected evidence`,
      "- TBD",
      "",
    ].join("\n")
    if (!(await Filesystem.exists(planPath(sessionID)))) {
      await Filesystem.write(planPath(sessionID), plan)
    }
    await write(sessionID, init)
    await syncctx(sessionID)
    return init
  }

  export async function read(sessionID: SessionID) {
    return TaskState.parse(await Filesystem.readJson(taskPath(sessionID)))
  }

  export async function write(sessionID: SessionID, state: TaskState) {
    const next = TaskState.parse(state)
    verifySync(next)
    await Filesystem.writeJson(taskPath(sessionID), next)
    await Filesystem.write(taskMdPath(sessionID), render(next))
    await syncctx(sessionID)
  }

  export async function sync(sessionID: SessionID) {
    await write(sessionID, await read(sessionID))
  }

  export async function files(sessionID: SessionID) {
    const base = root(sessionID)
    return {
      task_json: taskPath(sessionID),
      task_md: taskMdPath(sessionID),
      implementation_plan: planPath(sessionID),
      verification: verifyPath(sessionID),
      resume: resumePath(sessionID),
      context: contextPath(sessionID),
      knowledge: path.join(base, "knowledge.jsonl"),
      exists: {
        task_json: await Filesystem.exists(taskPath(sessionID)),
        task_md: await Filesystem.exists(taskMdPath(sessionID)),
        implementation_plan: await Filesystem.exists(planPath(sessionID)),
        verification: await Filesystem.exists(verifyPath(sessionID)),
        resume: await Filesystem.exists(resumePath(sessionID)),
        context: await Filesystem.exists(contextPath(sessionID)),
        knowledge: await Filesystem.exists(path.join(base, "knowledge.jsonl")),
      },
    }
  }

  export async function setPlanHash(sessionID: SessionID) {
    const state = await read(sessionID)
    const text = await Filesystem.readText(planPath(sessionID)).catch(() => "")
    validatePlan(text)
    const items = parsePlan(text)
    if (items.length > 0) state.checklist = items
    state.plan.hash = hash(text)
    await write(sessionID, state)
    return state
  }

  export async function planStatus(sessionID: SessionID) {
    const text = await Filesystem.readText(planPath(sessionID)).catch(() => "")
    const missing = planIssues(text)
    return {
      text,
      missing,
      ready: missing.length === 0,
    }
  }

  export async function writeVerification(sessionID: SessionID, verify: VerifyState) {
    await Filesystem.writeJson(verifyPath(sessionID), VerifyState.parse(verify))
    await syncctx(sessionID)
  }

  export async function readVerification(sessionID: SessionID) {
    if (!(await Filesystem.exists(verifyPath(sessionID)))) return null
    return VerifyState.parse(await Filesystem.readJson(verifyPath(sessionID)))
  }

  export async function checkPlanDrift(sessionID: SessionID) {
    const state = await read(sessionID)
    const plan = await Filesystem.readText(planPath(sessionID)).catch(() => "")
    if (state.plan.locked && state.plan.hash && hash(plan) !== state.plan.hash) {
      log.warn("plan drift detected", { sessionID, expected: state.plan.hash, actual: hash(plan) })
      throw new Error("plan-lock drift detected: implementation plan has been modified after lock. Re-lock the plan if these changes were intentional.")
    }
    return true
  }

  export async function assertExecution(ctx: Tool.Context, filePath?: string) {
    const state = await read(ctx.sessionID)
    const isSessionFile = filePath?.includes(".opencode/heidi") || filePath?.includes(".gemini/antigravity")
    
    // 1. Check FSM state
    if (state.fsm_state !== "EXECUTION" && state.fsm_state !== "VERIFICATION" && !isSessionFile) {
      throw new Error(`Execution blocked: ${ctx.callID ?? "tool"} requires EXECUTION or VERIFICATION state. Current state: ${state.fsm_state}. Ensure the implementation plan is complete and begin execution first.`)
    }

    // 2. Check plan completeness and drift
    if ((state.fsm_state === "EXECUTION" || state.fsm_state === "VERIFICATION") && !isSessionFile) {
      const plan = await planStatus(ctx.sessionID)
      if (!plan.ready) {
        throw new Error(`Execution blocked: Implementation plan is incomplete. Missing or TBD sections: ${plan.missing.join(", ")}`)
      }
      await checkPlanDrift(ctx.sessionID)
    }

    log.info("preflight passed", { callID: ctx.callID, state: state.fsm_state, file: filePath })
  }

  export async function writeResume(sessionID: SessionID, resume: ResumeState) {
    await Filesystem.writeJson(resumePath(sessionID), ResumeState.parse(resume))
    await syncctx(sessionID)
  }

  export async function updateResume(sessionID: SessionID) {
    const state = await read(sessionID)
    const done = state.checklist.filter((item) => item.status === "done").map((item) => item.id)
    const pending = state.checklist.filter((item) => item.status !== "done").map((item) => item.id)
    const plan =
      state.fsm_state === "DISCOVERY" || state.fsm_state === "PLAN_DRAFT" ? await planStatus(sessionID) : undefined
    const step = next(state, pending, plan?.ready ?? false)
    state.resume.next_step = step
    await write(sessionID, state)
    await writeResume(sessionID, {
      run_id: state.run_id,
      task_id: state.task_id,
      fsm_state: state.fsm_state,
      objective: state.objective.text,
      plan_ref: state.plan.path,
      completed: done,
      pending,
      touched_files: state.active_files,
      edited_files: state.changed_files,
      last_validations: state.verification_commands,
      failed_hypotheses: state.resume.failed_hypotheses,
      next_step: typeof step === "string" ? step : undefined,
      checkpoint_ref: state.resume.checkpoint_id,
      narrative: `Heidi is in ${state.fsm_state} state (Mode: ${state.mode}). Completed ${done.length} items. Next transition: ${state.next_transition}. Last successful step: ${state.last_successful_step || "init"}.`,
    })
  }
}
