import { createSignal, createEffect, onCleanup } from "solid-js"

interface DeltaBatch {
  messageId: string
  partId: string
  deltas: Array<{
    type: 'text' | 'status' | 'metadata'
    content: string
    timestamp: number
  }>
  isComplete: boolean
  hasError: boolean
}

interface FrameBatcher {
  pendingBatches: Map<string, DeltaBatch>
  frameScheduled: boolean
  immediateFlushKeys: Set<string>
  
  // Performance tracking
  frameCount: number
  immediateFlushCount: number
  droppedFrames: number
}

class KeyedFrameBatcher {
  private batcher: FrameBatcher = {
    pendingBatches: new Map(),
    frameScheduled: false,
    immediateFlushKeys: new Set(),
    frameCount: 0,
    immediateFlushCount: 0,
    droppedFrames: 0
  }

  private maxQueueSize = 100
  private frameDeadline = 16 // 60fps
  private lastFrameTime = 0

  // Add delta to batch
  addDelta(
    messageId: string, 
    partId: string, 
    delta: DeltaBatch['deltas'][0],
    options: {
      immediate?: boolean
      terminal?: boolean
    } = {}
  ) {
    const key = `${messageId}:${partId}`
    const existing = this.batcher.pendingBatches.get(key)
    
    if (!existing) {
      this.batcher.pendingBatches.set(key, {
        messageId,
        partId,
        deltas: [delta],
        isComplete: false,
        hasError: false
      })
    } else {
      // Merge deltas, keep only latest for same type
      const filtered = existing.deltas.filter(d => d.type !== delta.type)
      existing.deltas = [...filtered, delta]
    }

    // Handle immediate flush conditions
    if (options.immediate || options.terminal) {
      this.batcher.immediateFlushKeys.add(key)
      this.scheduleImmediateFlush(key)
    } else {
      this.scheduleFrameFlush()
    }

    // Backpressure: drop old deltas if queue is full
    if (this.batcher.pendingBatches.size > this.maxQueueSize) {
      this.applyBackpressure()
    }
  }

  // Mark part as complete (triggers immediate flush)
  markComplete(messageId: string, partId: string, hasError: boolean = false) {
    const key = `${messageId}:${partId}`
    const batch = this.batcher.pendingBatches.get(key)
    
    if (batch) {
      batch.isComplete = true
      batch.hasError = hasError
      this.batcher.immediateFlushKeys.add(key)
      this.scheduleImmediateFlush(key)
    }
  }

  // Schedule frame-based flush
  private scheduleFrameFlush() {
    if (this.batcher.frameScheduled) return
    
    this.batcher.frameScheduled = true
    requestAnimationFrame(() => this.flushFrame())
  }

  // Schedule immediate flush
  private scheduleImmediateFlush(key: string) {
    // Cancel any pending frame flush for this key
    this.batcher.immediateFlushKeys.add(key)
    
    // Flush immediately in next microtask
    Promise.resolve().then(() => {
      if (this.batcher.immediateFlushKeys.has(key)) {
        this.flushImmediate(key)
      }
    })
  }

  // Flush all pending frame updates
  private flushFrame() {
    const now = performance.now()
    const frameTime = now - this.lastFrameTime
    this.lastFrameTime = now
    
    // Skip frame if we're behind schedule
    if (frameTime < this.frameDeadline) {
      this.performFlush('frame')
    } else {
      this.batcher.droppedFrames++
      console.warn(`Frame dropped: ${frameTime.toFixed(2)}ms > ${this.frameDeadline}ms`)
    }
    
    this.batcher.frameScheduled = false
    this.batcher.frameCount++
  }

  // Flush specific key immediately
  private flushImmediate(key: string) {
    this.performFlush('immediate', key)
    this.batcher.immediateFlushKeys.delete(key)
    this.batcher.immediateFlushCount++
  }

  // Perform the actual flush
  private performFlush(type: 'frame' | 'immediate', specificKey?: string) {
    const flushStart = performance.now()
    const flushedKeys: string[] = []
    
    for (const [key, batch] of this.batcher.pendingBatches) {
      // Skip if this is an immediate flush and key doesn't match
      if (type === 'immediate' && specificKey && key !== specificKey) continue
      
      // Skip if this key is scheduled for immediate flush (unless it's the specific key)
      if (type === 'frame' && this.batcher.immediateFlushKeys.has(key) && key !== specificKey) continue
      
      // Apply the batched updates
      this.applyBatch(batch)
      flushedKeys.push(key)
    }
    
    // Remove flushed batches
    for (const key of flushedKeys) {
      this.batcher.pendingBatches.delete(key)
    }
    
    const flushTime = performance.now() - flushStart
    
    // Performance monitoring
    if (flushTime > 10) { // Warn if flush takes too long
      console.warn(`Slow ${type} flush: ${flushTime.toFixed(2)}ms for ${flushedKeys.length} batches`)
    }
  }

  // Apply batched updates to store
  private applyBatch(batch: DeltaBatch) {
    // This would integrate with the performance store
    // For now, we'll emit events that components can listen to
    const event = new CustomEvent('deltaBatch', {
      detail: {
        messageId: batch.messageId,
        partId: batch.partId,
        deltas: batch.deltas,
        isComplete: batch.isComplete,
        hasError: batch.hasError
      }
    })
    
    window.dispatchEvent(event)
  }

  // Apply backpressure by dropping oldest batches
  private applyBackpressure() {
    const entries = Array.from(this.batcher.pendingBatches.entries())
    
    // Sort by timestamp, drop oldest non-completed batches
    entries.sort((a, b) => {
      const aTime = Math.max(...a[1].deltas.map(d => d.timestamp))
      const bTime = Math.max(...b[1].deltas.map(d => d.timestamp))
      return aTime - bTime
    })
    
    let dropped = 0
    for (const [key, batch] of entries) {
      if (this.batcher.pendingBatches.size <= this.maxQueueSize * 0.8) break
      if (!batch.isComplete && !this.batcher.immediateFlushKeys.has(key)) {
        this.batcher.pendingBatches.delete(key)
        dropped++
      }
    }
    
    if (dropped > 0) {
      console.warn(`Backpressure: dropped ${dropped} old batches`)
    }
  }

  // Get performance metrics
  getMetrics() {
    return {
      pendingBatches: this.batcher.pendingBatches.size,
      immediateFlushKeys: this.batcher.immediateFlushKeys.size,
      frameCount: this.batcher.frameCount,
      immediateFlushCount: this.batcher.immediateFlushCount,
      droppedFrames: this.batcher.droppedFrames,
      averageFrameTime: this.lastFrameTime
    }
  }

  // Reset metrics
  resetMetrics() {
    this.batcher.frameCount = 0
    this.batcher.immediateFlushCount = 0
    this.batcher.droppedFrames = 0
    this.lastFrameTime = 0
  }

  // Cleanup
  cleanup() {
    this.batcher.pendingBatches.clear()
    this.batcher.immediateFlushKeys.clear()
    this.batcher.frameScheduled = false
  }
}

// Global batcher instance
export const frameBatcher = new KeyedFrameBatcher()

// Hook for components to listen to batched updates
export function useDeltaBatch(messageId: string, partId: string) {
  const [updates, setUpdates] = createSignal<DeltaBatch['deltas']>([])
  const key = `${messageId}:${partId}`

  const handleBatch = (event: CustomEvent) => {
    const { messageId, partId, deltas } = event.detail
    if (messageId === messageId && partId === partId) {
      setUpdates(deltas)
    }
  }

  createEffect(() => {
    window.addEventListener('deltaBatch', handleBatch as EventListener)
    
    onCleanup(() => {
      window.removeEventListener('deltaBatch', handleBatch as EventListener)
    })
  })

  return updates
}

// Convenience functions for common operations
export function addTextDelta(
  messageId: string, 
  partId: string, 
  content: string,
  options?: { immediate?: boolean }
) {
  frameBatcher.addDelta(messageId, partId, {
    type: 'text',
    content,
    timestamp: Date.now()
  }, options)
}

export function addStatusDelta(
  messageId: string, 
  partId: string, 
  status: string,
  options?: { terminal?: boolean }
) {
  frameBatcher.addDelta(messageId, partId, {
    type: 'status',
    content: status,
    timestamp: Date.now()
  }, { terminal: options?.terminal })
}

export function addMetadataDelta(
  messageId: string, 
  partId: string, 
  metadata: Record<string, any>,
  options?: { immediate?: boolean }
) {
  frameBatcher.addDelta(messageId, partId, {
    type: 'metadata',
    content: JSON.stringify(metadata),
    timestamp: Date.now()
  }, options)
}

export function completePart(
  messageId: string, 
  partId: string, 
  hasError: boolean = false
) {
  frameBatcher.markComplete(messageId, partId, hasError)
}
