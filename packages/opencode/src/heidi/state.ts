import { createHash } from "crypto"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { Global } from "@/global"
import { Identifier } from "@/id/id"
import { SessionID } from "@/session/schema"
import { TaskState, VerifyState, ResumeState } from "./schema"
import { Instance } from "@/project/instance"

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

function verifySync(state: TaskState) {
  if (state.fsm_state === "COMPLETE" && !state.plan.locked) {
    throw new Error("complete state requires locked plan")
  }
}

function now() {
  return new Date().toISOString()
}

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex")
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
  const categories = ["Modify", "New", "Delete", "Verify"]
  for (const cat of categories) {
    const items = state.checklist.filter((item) => item.category === cat)
    if (items.length === 0) continue
    out.push(`#### ${cat}`)
    out.push(...items.map((item) => `- [${item.status === "done" ? "x" : item.status === "doing" ? "/" : " "}] ${item.label}`))
  }
  return out.join("\n") + "\n"
}

export namespace HeidiState {
  export function plan(sessionID: SessionID) {
    return planPath(sessionID)
  }

  export async function ensure(sessionID: SessionID, objective: string) {
    const p = taskPath(sessionID)
    const exists = await Filesystem.exists(p)
    if (exists) return await read(sessionID)

    const task_id = sessionID
    const init: TaskState = {
      run_id: Identifier.ascending("tool"),
      task_id,
      fsm_state: "IDLE",
      mode: "PLANNING",
      objective: {
        locked: false,
        text: objective,
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
      objective || "TBD",
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
  }

  export async function sync(sessionID: SessionID) {
    const state = await read(sessionID)
    await write(sessionID, state)
  }

  export async function files(sessionID: SessionID) {
    const base = root(sessionID)
    return {
      task_json: taskPath(sessionID),
      task_md: taskMdPath(sessionID),
      implementation_plan: planPath(sessionID),
      verification: verifyPath(sessionID),
      resume: resumePath(sessionID),
      knowledge: path.join(base, "knowledge.jsonl"),
      exists: {
        task_json: await Filesystem.exists(taskPath(sessionID)),
        task_md: await Filesystem.exists(taskMdPath(sessionID)),
        implementation_plan: await Filesystem.exists(planPath(sessionID)),
        verification: await Filesystem.exists(verifyPath(sessionID)),
        resume: await Filesystem.exists(resumePath(sessionID)),
        knowledge: await Filesystem.exists(path.join(base, "knowledge.jsonl")),
      },
    }
  }

  export async function setPlanHash(sessionID: SessionID) {
    const state = await read(sessionID)
    const plan = await Filesystem.readText(planPath(sessionID)).catch(() => "")
    state.plan.hash = hash(plan)
    await write(sessionID, state)
    return state
  }

  export async function writeVerification(sessionID: SessionID, verify: VerifyState) {
    await Filesystem.writeJson(verifyPath(sessionID), VerifyState.parse(verify))
  }

  export async function writeResume(sessionID: SessionID, resume: ResumeState) {
    await Filesystem.writeJson(resumePath(sessionID), ResumeState.parse(resume))
  }

  export async function updateResume(sessionID: SessionID) {
    const state = await read(sessionID)
    const done = state.checklist.filter((item) => item.status === "done").map((item) => item.id)
    const pending = state.checklist.filter((item) => item.status !== "done").map((item) => item.id)
    const resume: ResumeState = {
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
      next_step: state.resume.next_step,
      checkpoint_ref: state.resume.checkpoint_id,
      narrative: `Heidi is in ${state.fsm_state} state (Mode: ${state.mode}). Completed ${done.length} items. Next transition: ${state.next_transition}. Last successful step: ${state.last_successful_step || "init"}.`,
    }
    await writeResume(sessionID, resume)
  }
}
