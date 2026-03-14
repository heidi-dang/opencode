import { createSignal, onCleanup } from "solid-js"

/**
 * PartDelta Batcher - coalesces PartDelta events to reduce render frequency
 *
 * Key: (messageID, partID) - NOT just runID
 * Different event types have different semantics and must not be coalesced incorrectly
 *
 * Flush triggers:
 * - Terminal part update (running → completed/error)
 * - Run finish
 * - Session finish
 * - Component unmount
 * - Visibility loss (tab hidden)
 */

export type DeltaKey = string // `${messageID}:${partID}`

export interface DeltaEvent {
  messageID: string
  partID: string
  delta: string
  timestamp: number
}

export interface BatchedUpdate {
  messageID: string
  partID: string
  combinedDelta: string
}

// Batching configuration
const BATCH_WINDOW_MS = 16 // 16ms = ~60fps target
const MAX_BATCH_SIZE = 100

export function createDeltaBatcher(options?: {
  batchWindowMs?: number
  maxBatchSize?: number
  onFlush?: (updates: BatchedUpdate[]) => void
}) {
  const batchWindowMs = options?.batchWindowMs ?? BATCH_WINDOW_MS
  const maxBatchSize = options?.maxBatchSize ?? MAX_BATCH_SIZE
  const onFlush = options?.onFlush

  // Queue: Map<key, string[]> - accumulates deltas per (messageID, partID)
  const queue = new Map<DeltaKey, string[]>()

  let flushTimeout: ReturnType<typeof setTimeout> | undefined
  let pending = false

  /**
   * Add a delta to the batch queue
   * Key is (messageID, partID) to separate different tool parts
   */
  function add(messageID: string, partID: string, delta: string) {
    const key = `${messageID}:${partID}`
    const existing = queue.get(key) ?? []
    existing.push(delta)
    queue.set(key, existing)

    // Immediate flush if batch is full
    if (existing.length >= maxBatchSize) {
      flush()
      return
    }

    // Start batch window if not already running
    if (!flushTimeout) {
      flushTimeout = setTimeout(() => flush(), batchWindowMs)
    }
  }

  /**
   * Flush all pending deltas - coalesce by key and notify
   */
  function flush() {
    if (flushTimeout) {
      clearTimeout(flushTimeout)
      flushTimeout = undefined
    }

    if (queue.size === 0) return

    // Coalesce: concatenate all deltas for each (messageID, partID)
    const updates: BatchedUpdate[] = []

    for (const [key, deltas] of queue) {
      const [messageID, partID] = key.split(":")
      const combinedDelta = deltas.join("")
      updates.push({ messageID, partID, combinedDelta })
    }

    // Clear queue
    queue.clear()

    // Notify listener
    if (onFlush && updates.length > 0) {
      onFlush(updates)
    }

    pending = false
  }

  /**
   * Force immediate flush - call on terminal transitions
   */
  function flushNow() {
    flush()
  }

  /**
   * Check if there are pending updates
   */
  function hasPending(): boolean {
    return queue.size > 0
  }

  // Cleanup on dispose
  onCleanup(() => {
    if (flushTimeout) {
      clearTimeout(flushTimeout)
    }
    queue.clear()
  })

  return {
    add,
    flush,
    flushNow,
    hasPending,
  }
}

/**
 * Terminal flush rules - when to flush immediately
 */
export function createTerminalFlushRules(batcher: ReturnType<typeof createDeltaBatcher>) {
  // Flush on terminal part update
  function onPartComplete() {
    batcher.flushNow()
  }

  // Flush on run finish
  function onRunFinish() {
    batcher.flushNow()
  }

  // Flush on visibility loss (tab hidden)
  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      batcher.flushNow()
    }
  }

  // Setup visibility listener
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  // Cleanup
  onCleanup(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  })

  return {
    onPartComplete,
    onRunFinish,
  }
}

/**
 * Create a simple signal-based delta tracker for components
 * This is a lighter alternative to the full batcher for simpler use cases
 */
export function createDeltaTracker() {
  const [deltas, setDeltas] = createSignal<Map<string, string>>(new Map())
  let batchTimeout: ReturnType<typeof setTimeout> | undefined

  function addDelta(key: string, delta: string) {
    setDeltas((prev) => {
      const next = new Map(prev)
      const existing = next.get(key) ?? ""
      next.set(key, existing + delta)
      return next
    })

    // Auto-flush after window
    if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        batchTimeout = undefined
        // Signal that updates are ready - components should re-read
      }, BATCH_WINDOW_MS)
    }
  }

  function clear() {
    setDeltas(new Map())
  }

  onCleanup(() => {
    if (batchTimeout) {
      clearTimeout(batchTimeout)
    }
  })

  return {
    deltas,
    addDelta,
    clear,
  }
}
