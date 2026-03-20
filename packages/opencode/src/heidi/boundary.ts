import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"
import { SessionID } from "@/session/schema"
import { HeidiState } from "./state"
import { Mode, FsmState, TaskState, VerifyState } from "./schema"
import { Identifier } from "@/id/id"
import { HeidiVerify } from "./verify"

const allowed = new Set([
  "IDLE->DISCOVERY",
  "DISCOVERY->PLAN_DRAFT",
  "PLAN_DRAFT->PLAN_LOCKED",
  "PLAN_LOCKED->EXECUTION",
  "EXECUTION->VERIFICATION",
  "VERIFICATION->COMPLETE",
  // Allowed regressions
  "PLAN_LOCKED->DISCOVERY",
  "EXECUTION->PLAN_DRAFT",
  "EXECUTION->DISCOVERY",
  "VERIFICATION->EXECUTION",
  "VERIFICATION->PLAN_DRAFT",
  "VERIFICATION->DISCOVERY",
  // Transitions to BLOCKED
  "IDLE->BLOCKED",
  "DISCOVERY->BLOCKED",
  "PLAN_DRAFT->BLOCKED",
  "PLAN_LOCKED->BLOCKED",
  "EXECUTION->BLOCKED",
  "VERIFICATION->BLOCKED",
  "COMPLETE->BLOCKED",
  "BLOCKED->BLOCKED",
])

const StateMode: Record<z.infer<typeof FsmState>, z.infer<typeof Mode>> = {
  IDLE: "PLANNING",
  DISCOVERY: "PLANNING",
  PLAN_DRAFT: "PLANNING",
  PLAN_LOCKED: "PLANNING",
  EXECUTION: "EXECUTION",
  VERIFICATION: "VERIFICATION",
  COMPLETE: "VERIFICATION",
  BLOCKED: "PLANNING",
}

const Request = z.object({
  run_id: z.string().optional(),
  task_id: SessionID.zod,
  action: z.enum([
    "start",
    "set_mode",
    "mark_item",
    "lock_plan",
    "reopen_plan",
    "begin_execution",
    "request_verification",
    "block",
    "complete",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
})

const Response = z.object({
  ok: z.boolean(),
  fsm_state: FsmState,
  mode: Mode,
  task_json_version: z.number(),
  artifacts: z
    .object({
      task_json: z.string(),
      task_md: z.string(),
      implementation_plan: z.string(),
      verification: z.string(),
      resume: z.string(),
      knowledge: z.string(),
      exists: z.record(z.string(), z.boolean()),
    })
    .optional(),
  error: z.string().nullable().optional(),
})

export namespace HeidiBoundary {
  export const Event = {
    Updated: BusEvent.define(
      "task_boundary.updated",
      z.object({
        task_id: SessionID.zod,
        mode: Mode,
        fsm_state: FsmState,
      }),
    ),
  }

  export const Input = Request
  export const Output = Response

  function move(state: TaskState, next: z.infer<typeof FsmState>) {
    const edge = `${state.fsm_state}->${next}`
    if (!allowed.has(edge)) throw new Error(`Invalid transition ${edge}`)
    state.fsm_state = next
    state.mode = StateMode[next]
  }

  function requirePlan(state: TaskState) {
    const missing = [] as string[]
    if (!state.plan.path) missing.push("plan.path")
    if (!state.objective.text) missing.push("objective.text")
    if (missing.length) throw new Error(`Plan incomplete: ${missing.join(", ")}`)
  }

  export async function apply(input: z.infer<typeof Request>) {
    const req = Request.parse(input)
    const state = await HeidiState.ensure(req.task_id, req.payload.objective ? String(req.payload.objective) : "")

    if (req.action === "start") {
      state.run_id = req.run_id || state.run_id || Identifier.ascending("tool")
      if (req.payload.objective) state.objective.text = String(req.payload.objective)
      move(state, "DISCOVERY")
      state.last_successful_step = "start"
      state.next_transition = "DISCOVERY->PLAN_DRAFT"
      state.resume.next_step = "DISCOVERY"
      state.block_reason = null
    }

    if (req.action === "set_mode") {
      const mode = Mode.parse(req.payload.mode)
      state.mode = mode
    }

    if (req.action === "mark_item") {
      const id = String(req.payload.id)
      const status = z.enum(["todo", "doing", "done", "blocked"]).parse(req.payload.status)
      const found = state.checklist.find((item) => item.id === id)
      if (!found) throw new Error(`Checklist item not found: ${id}`)
      found.status = status
      state.last_successful_step = `mark_item:${id}`
    }

    if (req.action === "lock_plan") {
      if (state.fsm_state === "DISCOVERY") {
        move(state, "PLAN_DRAFT")
        await HeidiState.write(req.task_id, state)
      }
      requirePlan(state)
      await HeidiState.setPlanHash(req.task_id)
      const next = await HeidiState.read(req.task_id)
      next.objective.locked = true
      next.plan.locked = true
      move(next, "PLAN_LOCKED")
      next.last_successful_step = "lock_plan"
      next.next_transition = "PLAN_LOCKED->EXECUTION"
      next.resume.next_step = "begin_execution"
      await HeidiState.write(req.task_id, next)
      await HeidiState.updateResume(req.task_id)
      const artifacts = await HeidiState.files(req.task_id)
      await Bus.publish(Event.Updated, { task_id: req.task_id, mode: next.mode, fsm_state: next.fsm_state })
      return Response.parse({
        ok: true,
        fsm_state: next.fsm_state,
        mode: next.mode,
        task_json_version: 1,
        artifacts,
        error: null,
      })
    }

    if (req.action === "reopen_plan") {
      if (!req.payload.reason) throw new Error("reopen_plan requires reason")
      state.plan.locked = false
      state.objective.locked = false
      state.plan.amendments.push({
        id: Identifier.ascending("tool"),
        reason: String(req.payload.reason),
        timestamp: new Date().toISOString(),
      })
      move(state, "DISCOVERY")
      state.last_successful_step = "reopen_plan"
      state.next_transition = "DISCOVERY->PLAN_DRAFT"
      state.resume.next_step = "DISCOVERY"
    }

    if (req.action === "begin_execution") {
      if (!state.plan.locked) throw new Error("Plan must be locked before execution")
      await HeidiState.checkPlanDrift(req.task_id)
      move(state, "EXECUTION")
      state.last_successful_step = "begin_execution"
      state.next_transition = "EXECUTION->VERIFICATION"
      state.resume.next_step = "EXECUTION"
    }

    if (req.action === "request_verification") {
      await HeidiVerify.preflight(req.task_id)
      move(state, "VERIFICATION")
      state.last_successful_step = "request_verification"
      state.next_transition = "VERIFICATION->COMPLETE"
      state.resume.next_step = "VERIFICATION"
    }

    if (req.action === "block") {
      state.block_reason = String(req.payload.reason ?? "blocked")
      move(state, "BLOCKED")
      state.last_successful_step = "block"
      state.next_transition = "BLOCKED"
      state.resume.next_step = "blocked"
    }

    if (req.action === "complete") {
      if (state.fsm_state !== "VERIFICATION") throw new Error("Task can only complete from VERIFICATION")
      await HeidiVerify.gate(req.task_id)
      const verify = await HeidiState.readVerification(req.task_id)
      if (!verify) throw new Error("Verification must exist before completion")
      if (verify.status !== "pass") throw new Error("Verification must pass before completion")
      move(state, "COMPLETE")
      state.last_successful_step = "complete"
      state.next_transition = "NONE"
      state.resume.next_step = "done"
    }

    await HeidiState.write(req.task_id, state)
    await HeidiState.updateResume(req.task_id)
    const artifacts = await HeidiState.files(req.task_id)
    await Bus.publish(Event.Updated, {
      task_id: req.task_id,
      mode: state.mode,
      fsm_state: state.fsm_state,
    })

    return Response.parse({
      ok: true,
      fsm_state: state.fsm_state,
      mode: state.mode,
      task_json_version: 1,
      artifacts,
      error: null,
    })
  }
}
