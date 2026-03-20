import z from "zod"

function now() {
  return new Date().toISOString()
}

const empty = () => ({
  checkpoint_count: 0,
  rollback_count: 0,
  command_failure_count: 0,
  active_subagents: 0,
  last_timeout_at: null as string | null,
  last_conflict_at: null as string | null,
  last_rollback_at: null as string | null,
})

const state = empty()

export const HeidiHealthSummary = z.object({
  checkpoint_count: z.number(),
  rollback_count: z.number(),
  command_failure_count: z.number(),
  active_subagents: z.number(),
  last_timeout_at: z.string().nullable(),
  last_conflict_at: z.string().nullable(),
  last_rollback_at: z.string().nullable(),
})

export namespace HeidiHealth {
  export function checkpoint() {
    state.checkpoint_count++
  }

  export function rollback(at = now()) {
    state.rollback_count++
    state.last_rollback_at = at
  }

  export function commandFailure() {
    state.command_failure_count++
  }

  export function subagentStart() {
    state.active_subagents++
  }

  export function subagentStop() {
    state.active_subagents = Math.max(0, state.active_subagents - 1)
  }

  export function timeout(at = now()) {
    state.last_timeout_at = at
  }

  export function conflict(at = now()) {
    state.last_conflict_at = at
  }

  export function summary() {
    return { ...state }
  }

  export function reset() {
    Object.assign(state, empty())
  }
}