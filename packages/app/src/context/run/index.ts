import { createSignal, createEffect, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createDeltaBatcher, type BatchedUpdate } from "./delta-batcher"

// Constants for capped state retention
const MAX_RECENT_STEPS = 5
const MAX_PREVIEW_LINES = 5
const MAX_RUN_STATE_AGE_MS = 30 * 60 * 1000 // 30 minutes

export type RunStatus =
  | "pending"
  | "thinking"
  | "planning"
  | "editing"
  | "running"
  | "testing"
  | "committing"
  | "pushing"
  | "completed"
  | "failed"
  | "cancelled"

export interface StepInfo {
  id: string
  action: string
  status: "pending" | "running" | "success" | "error"
  preview?: string
  startedAt: number
  finishedAt?: number
}

export interface RunState {
  id: string
  sessionID: string
  status: RunStatus
  title: string
  currentStep?: string
  recentSteps: StepInfo[] // Capped at MAX_RECENT_STEPS
  preview?: string // Last command preview
  error?: string
  startedAt: number
  updatedAt: number
}

/**
 * Create ephemeral live run store
 * 
 * This store tracks only current run state - not the full message history.
 * Completed runs fall back to persisted message state.
 * 
 * Memory management: 
 * - Recent steps capped at MAX_RECENT_STEPS
 * - Preview capped at MAX_PREVIEW_LINES
 * - Periodic cleanup of old completed runs
 */
export function createLiveRunStore(options?: {
  maxRecentSteps?: number
  maxPreviewLines?: number
  maxAgeMs?: number
}) {
  const maxRecentSteps = options?.maxRecentSteps ?? MAX_RECENT_STEPS
  const maxPreviewLines = options?.maxPreviewLines ?? MAX_PREVIEW_LINES
  const maxAgeMs = options?.maxAgeMs ?? MAX_RUN_STATE_AGE_MS

  const [runs, setRuns] = createStore<Record<string, RunState>>({})

  // Create delta batcher for PartDelta events
  const batcher = createDeltaBatcher({
    batchWindowMs: 50,
    onFlush: (updates: BatchedUpdate[]) => {
      // Apply batched updates to store
      for (const update of updates) {
        applyDeltaUpdate(update.messageID, update.partID, update.combinedDelta)
      }
    },
  })

  /**
   * Apply a coalesced delta update to the run state
   */
  function applyDeltaUpdate(messageID: string, partID: string, delta: string) {
    // Find the run that contains this part
    // For now, find by looking through runs
    for (const [runID, run] of Object.entries(runs)) {
      // Check if this messageID belongs to this run
      // This is a simplified check - in production would be more precise
      if (run.status === "running" || run.status === "thinking") {
        // Append delta to preview
        setRuns(
          runID,
          produce((r) => {
            if (r.preview) {
              r.preview = r.preview + delta
              // Cap preview length
              const lines = r.preview.split("\n")
              if (lines.length > maxPreviewLines) {
                r.preview = lines.slice(-maxPreviewLines).join("\n")
              }
            } else {
              r.preview = delta
            }
            r.updatedAt = Date.now()
          }),
        )
      }
    }
  }

  /**
   * Start a new run
   */
  function startRun(runID: string, sessionID: string, initialStatus: RunStatus = "thinking") {
    const now = Date.now()
    setRuns(
      runID,
      produce((r) => {
        r.id = runID
        r.sessionID = sessionID
        r.status = initialStatus
        r.title = getStatusTitle(initialStatus)
        r.recentSteps = []
        r.startedAt = now
        r.updatedAt = now
      }),
    )
  }

  /**
   * Update run status
   */
  function setStatus(runID: string, status: RunStatus) {
    setRuns(
      runID,
      produce((r) => {
        r.status = status
        r.title = getStatusTitle(status)
        r.updatedAt = Date.now()
      }),
    )
    // Flush deltas on status change
    batcher.flushNow()
  }

  /**
   * Set current step
   */
  function setCurrentStep(runID: string, stepID: string, action: string) {
    setRuns(
      runID,
      produce((r) => {
        r.currentStep = action
        // Add to recent steps (capped)
        const step: StepInfo = {
          id: stepID,
          action,
          status: "running",
          startedAt: Date.now(),
        }
        r.recentSteps = [...r.recentSteps.slice(-(maxRecentSteps - 1)), step]
        r.updatedAt = Date.now()
      }),
    )
  }

  /**
   * Complete a step
   */
  function completeStep(runID: string, stepID: string, status: "success" | "error", preview?: string) {
    setRuns(
      runID,
      produce((r) => {
        // Update the step in recent steps
        const stepIndex = r.recentSteps.findIndex((s) => s.id === stepID)
        if (stepIndex >= 0) {
          r.recentSteps[stepIndex] = {
            ...r.recentSteps[stepIndex]!,
            status,
            finishedAt: Date.now(),
            preview,
          }
        }
        if (preview) {
          r.preview = preview
        }
        r.updatedAt = Date.now()
      }),
    )
    // Flush deltas on step completion
    batcher.flushNow()
  }

  /**
   * Add a delta (for streaming output)
   */
  function addDelta(messageID: string, partID: string, delta: string) {
    batcher.add(messageID, partID, delta)
  }

  /**
   * Get run state
   */
  function getRun(runID: string): RunState | undefined {
    return runs[runID]
  }

  /**
   * Get all active runs
   */
  function getActiveRuns(): RunState[] {
    const now = Date.now()
    return Object.values(runs).filter(
      (r) => r.status !== "completed" && r.status !== "failed" && r.status !== "cancelled",
    )
  }

  /**
   * Freeze a completed run (cleanup live state)
   * Completed runs should fall back to persisted message state
   */
  function freezeRun(runID: string) {
    // Keep minimal info for completed runs
    setRuns(
      runID,
      produce((r) => {
        // Clear recent steps to save memory
        r.recentSteps = r.recentSteps.slice(-3) // Keep last 3
        r.preview = r.preview?.split("\n").slice(-3).join("\n") // Keep last 3 lines
      }),
    )
    // Flush any remaining deltas
    batcher.flushNow()
  }

  /**
   * Remove a run completely
   */
  function removeRun(runID: string) {
    setRuns(
      produce((r) => {
        delete r[runID]
      }),
    )
  }

  /**
   * Periodic cleanup of old completed runs
   */
  function cleanupOldRuns() {
    const now = Date.now()
    setRuns(
      produce((r) => {
        for (const [runID, run] of Object.entries(r)) {
          if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
            if (now - run.updatedAt > maxAgeMs) {
              delete r[runID]
            }
          }
        }
      }),
    )
  }

  // Setup periodic cleanup
  const cleanupInterval = setInterval(cleanupOldRuns, 5 * 60 * 1000) // Every 5 minutes

  // Cleanup on dispose
  onCleanup(() => {
    clearInterval(cleanupInterval)
    batcher.flushNow()
  })

  return {
    runs,
    startRun,
    setStatus,
    setCurrentStep,
    completeStep,
    addDelta,
    getRun,
    getActiveRuns,
    freezeRun,
    removeRun,
    cleanupOldRuns,
    // Expose batcher for external flush triggers
    flushDeltas: batcher.flushNow,
  }
}

/**
 * Get display title for status
 */
function getStatusTitle(status: RunStatus): string {
  switch (status) {
    case "thinking":
      return "Thinking…"
    case "planning":
      return "Planning changes"
    case "editing":
      return "Editing files"
    case "running":
      return "Running commands"
    case "testing":
      return "Running tests"
    case "committing":
      return "Committing changes"
    case "pushing":
      return "Pushing changes"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    case "pending":
      return "Pending"
    default:
      return "Working…"
  }
}
