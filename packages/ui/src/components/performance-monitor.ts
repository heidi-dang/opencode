import { createSignal, createEffect, onCleanup } from "solid-js"

interface PerformanceMetrics {
  renderCount: number
  renderTime: number
  deltaRate: number
  queueDepth: number
  visibleNodes: number
  markdownParseTime: number
  syntaxHighlightTime: number
  scrollCorrectionCount: number
  memoryUsage: number
}

interface PerformanceBudget {
  p95UpdateFlush: number
  maxWholeTranscriptRecompute: number
  activeStreamingNodes: number
  completedMessageRenderCount: number
}

class PerformanceProfiler {
  private metrics = createSignal<PerformanceMetrics>({
    renderCount: 0,
    renderTime: 0,
    deltaRate: 0,
    queueDepth: 0,
    visibleNodes: 0,
    markdownParseTime: 0,
    syntaxHighlightTime: 0,
    scrollCorrectionCount: 0,
    memoryUsage: 0
  })

  private budgets: PerformanceBudget = {
    p95UpdateFlush: 50, // ms
    maxWholeTranscriptRecompute: 0,
    activeStreamingNodes: 10,
    completedMessageRenderCount: 0
  }

  private renderStartTimes = new Map<string, number>()
  private deltaTimestamps: number[] = []
  private lastFlushTime = 0

  // Track component renders
  startRender(componentId: string) {
    this.renderStartTimes.set(componentId, performance.now())
  }

  endRender(componentId: string) {
    const startTime = this.renderStartTimes.get(componentId)
    if (startTime) {
      const renderTime = performance.now() - startTime
      const [metrics, setMetrics] = this.metrics
      
      setMetrics(prev => ({
        ...prev,
        renderCount: prev.renderCount + 1,
        renderTime: prev.renderTime + renderTime
      }))
      
      this.renderStartTimes.delete(componentId)
    }
  }

  // Track delta events
  trackDelta() {
    const now = performance.now()
    this.deltaTimestamps.push(now)
    
    // Keep only last second of deltas
    const oneSecondAgo = now - 1000
    this.deltaTimestamps = this.deltaTimestamps.filter(t => t > oneSecondAgo)
    
    const [metrics, setMetrics] = this.metrics
    setMetrics(prev => ({
      ...prev,
      deltaRate: this.deltaTimestamps.length
    }))
  }

  // Track flush performance
  trackFlush(isComplete: boolean = false) {
    const now = performance.now()
    const flushTime = now - this.lastFlushTime
    this.lastFlushTime = now

    if (flushTime > this.budgets.p95UpdateFlush) {
      console.warn(`Flush exceeded budget: ${flushTime.toFixed(2)}ms > ${this.budgets.p95UpdateFlush}ms`)
    }

    const [metrics, setMetrics] = this.metrics
    setMetrics(prev => ({
      ...prev,
      queueDepth: isComplete ? 0 : prev.queueDepth + 1
    }))
  }

  // Track expensive operations
  trackMarkdownParse(time: number) {
    const [metrics, setMetrics] = this.metrics
    setMetrics(prev => ({
      ...prev,
      markdownParseTime: prev.markdownParseTime + time
    }))
  }

  trackSyntaxHighlight(time: number) {
    const [metrics, setMetrics] = this.metrics
    setMetrics(prev => ({
      ...prev,
      syntaxHighlightTime: prev.syntaxHighlightTime + time
    }))
  }

  // Track scroll corrections
  trackScrollCorrection() {
    const [metrics, setMetrics] = this.metrics
    setMetrics(prev => ({
      ...prev,
      scrollCorrectionCount: prev.scrollCorrectionCount + 1
    }))
  }

  // Track visible DOM nodes
  updateVisibleNodes(count: number) {
    const [metrics, setMetrics] = this.metrics
    setMetrics(prev => ({
      ...prev,
      visibleNodes: count
    }))
  }

  // Track memory usage
  updateMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      const [metrics, setMetrics] = this.metrics
      setMetrics(prev => ({
        ...prev,
        memoryUsage: memory.usedJSHeapSize
      }))
    }
  }

  // Get current metrics
  getMetrics() {
    return this.metrics[0]()
  }

  // Check budget compliance
  checkBudgets() {
    const metrics = this.getMetrics()
    const violations: string[] = []

    if (metrics.renderTime > this.budgets.p95UpdateFlush) {
      violations.push(`Render time: ${metrics.renderTime.toFixed(2)}ms`)
    }

    if (metrics.visibleNodes > this.budgets.activeStreamingNodes) {
      violations.push(`Visible nodes: ${metrics.visibleNodes}`)
    }

    if (violations.length > 0) {
      console.warn('Performance budget violations:', violations)
    }

    return violations
  }

  // Reset metrics
  reset() {
    const [, setMetrics] = this.metrics
    setMetrics({
      renderCount: 0,
      renderTime: 0,
      deltaRate: 0,
      queueDepth: 0,
      visibleNodes: 0,
      markdownParseTime: 0,
      syntaxHighlightTime: 0,
      scrollCorrectionCount: 0,
      memoryUsage: 0
    })
    this.deltaTimestamps = []
    this.renderStartTimes.clear()
  }
}

// Global profiler instance
export const profiler = new PerformanceProfiler()

// Performance monitoring hook for components
export function usePerformanceMonitor(componentId: string) {
  let mounted = false

  createEffect(() => {
    if (!mounted) {
      mounted = true
      profiler.startRender(componentId)
    }
  })

  onCleanup(() => {
    if (mounted) {
      profiler.endRender(componentId)
      mounted = false
    }
  })

  return profiler
}

// Performance budget guard
export function withPerformanceGuard<T>(
  operation: () => T,
  operationName: string,
  budgetMs: number = 16
): T {
  const start = performance.now()
  const result = operation()
  const duration = performance.now() - start

  if (duration > budgetMs) {
    console.warn(`${operationName} exceeded budget: ${duration.toFixed(2)}ms > ${budgetMs}ms`)
  }

  return result
}
