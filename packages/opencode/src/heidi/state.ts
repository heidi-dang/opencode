import { createHash } from "crypto"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Identifier } from "@/id/id"
import { SessionID } from "@/session/schema"
import { TaskState, VerifyState, ResumeState } from "./schema"
import { Instance } from "@/project/instance"
import { HeidiContext } from "./context"

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
  if (["PLAN_LOCKED", "COMPLETE"].includes(state.fsm_state) && !state.plan.locked) {
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
  out.push("### Checklist")
  for (const cat of ["Modify", "New", "Delete", "Verify"]) {
    const items = state.checklist.filter((item) => item.category === cat)
    if (items.length === 0) continue
    out.push(`#### ${cat}`)
    out.push(
      ...items.map((item) => `- [${item.status === "done" ? "x" : item.status === "doing" ? "/" : " "}] ${item.label}`),
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
    state.plan.hash = hash(await Filesystem.readText(planPath(sessionID)).catch(() => ""))
    await write(sessionID, state)
    return state
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
      throw new Error("plan-lock drift detected: plan has changed after lock")
    }
    return true
  }

  export async function writeResume(sessionID: SessionID, resume: ResumeState) {
    await Filesystem.writeJson(resumePath(sessionID), ResumeState.parse(resume))
    await syncctx(sessionID)
  }

  export async function updateResume(sessionID: SessionID) {
    const state = await read(sessionID)
    const done = state.checklist.filter((item) => item.status === "done").map((item) => item.id)
    const pending = state.checklist.filter((item) => item.status !== "done").map((item) => item.id)
    let next = state.resume.next_step
    if (state.checklist.length > 0 && pending.length === 0) {
      next = undefined
      state.resume.next_step = undefined
      await write(sessionID, state)
    }
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
      next_step: typeof next === "string" ? next : undefined,
      checkpoint_ref: state.resume.checkpoint_id,
      narrative: `Heidi is in ${state.fsm_state} state (Mode: ${state.mode}). Completed ${done.length} items. Next transition: ${state.next_transition}. Last successful step: ${state.last_successful_step || "init"}.`,
    })
  }
}
