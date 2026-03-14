import { createSignal, createEffect, onCleanup, type JSX, Show } from "solid-js"

interface BackpressureMetrics {
  queueSize: number
  processingTime: number
  renderTime: number
  memoryUsage: number
  droppedFrames: number
  isUnderPressure: boolean
}

interface BackpressureThresholds {
  maxQueueSize: number // Max items in queue before applying backpressure
  maxProcessingTime: number // Max processing time per item (ms)
  maxRenderTime: number // Max render time per frame (ms)
  maxMemoryUsage: number // Max memory usage (MB)
  maxDroppedFrames: number // Max dropped frames per second
}

interface BackpressureOptions {
  enableAdaptive: boolean // Enable adaptive throttling
  enableQueueLimit: boolean // Enable queue size limiting
  enableTimeLimit: boolean // Enable processing time limiting
  enableMemoryLimit: boolean // Enable memory usage limiting
  enableFrameLimit: boolean // Enable frame rate limiting
}

class UIBackpressureController {
  private metrics: BackpressureMetrics
  private thresholds: BackpressureThresholds
  private options: BackpressureOptions
  private processingQueue: Array<() => Promise<void>> = []
  private isProcessing = false
  private frameDropCounter = 0
  private lastFrameTime = 0
  private memoryCheckInterval: number | null = null

  // Event listeners for backpressure signals
  private listeners = new Set<(metrics: BackpressureMetrics) => void>()

  constructor(thresholds: Partial<BackpressureThresholds> = {}, options: Partial<BackpressureOptions> = {}) {
    this.thresholds = {
      maxQueueSize: 100,
      maxProcessingTime: 50,
      maxRenderTime: 16,
      maxMemoryUsage: 100,
      maxDroppedFrames: 5,
      ...thresholds,
    }

    this.options = {
      enableAdaptive: true,
      enableQueueLimit: true,
      enableTimeLimit: true,
      enableMemoryLimit: true,
      enableFrameLimit: true,
      ...options,
    }

    this.metrics = {
      queueSize: 0,
      processingTime: 0,
      renderTime: 0,
      memoryUsage: 0,
      droppedFrames: 0,
      isUnderPressure: false,
    }

    this.startMonitoring()
  }

  // Start performance monitoring
  private startMonitoring(): void {
    // Monitor frame drops
    this.monitorFrameRate()

    // Monitor memory usage
    this.monitorMemoryUsage()

    // Update metrics periodically
    const interval = setInterval(() => {
      this.updateMetrics()
    }, 1000) as unknown as number

    onCleanup(() => {
      clearInterval(interval)
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval)
      }
    })
  }

  // Monitor frame rate for dropped frames
  private monitorFrameRate(): void {
    let frameCount = 0
    let lastTime = performance.now()

    const checkFrameRate = () => {
      const now = performance.now()
      const deltaTime = now - lastTime

      if (deltaTime >= 1000) {
        const fps = frameCount
        const expectedFrames = Math.floor(deltaTime / 16.67) // 60fps
        this.frameDropCounter = Math.max(0, expectedFrames - frameCount)

        frameCount = 0
        lastTime = now
      }

      frameCount++
      requestAnimationFrame(checkFrameRate)
    }

    requestAnimationFrame(checkFrameRate)
  }

  // Monitor memory usage
  private monitorMemoryUsage(): void {
    if (!("memory" in performance)) return

    this.memoryCheckInterval = setInterval(() => {
      const memory = (performance as any).memory
      this.metrics.memoryUsage = memory.usedJSHeapSize / (1024 * 1024) // Convert to MB
    }, 2000) as unknown as number
  }

  // Update backpressure metrics
  private updateMetrics(): void {
    this.metrics.queueSize = this.processingQueue.length
    this.metrics.droppedFrames = this.frameDropCounter
    this.metrics.isUnderPressure = this.isUnderPressure()

    // Notify listeners
    for (const listener of this.listeners) {
      listener(this.metrics)
    }
  }

  // Check if system is under pressure
  private isUnderPressure(): boolean {
    const { metrics, thresholds, options } = this

    return (
      (options.enableQueueLimit && metrics.queueSize > thresholds.maxQueueSize) ||
      (options.enableTimeLimit && metrics.processingTime > thresholds.maxProcessingTime) ||
      (options.enableMemoryLimit && metrics.memoryUsage > thresholds.maxMemoryUsage) ||
      (options.enableFrameLimit && metrics.droppedFrames > thresholds.maxDroppedFrames)
    )
  }

  // Add task to processing queue with backpressure
  async addTask(task: () => Promise<void>, priority: "high" | "normal" | "low" = "normal"): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if we should apply backpressure
      if (this.shouldApplyBackpressure(priority)) {
        // Apply adaptive delay based on pressure level
        const delay = this.calculateBackpressureDelay()
        setTimeout(() => {
          this.enqueueTask(task, resolve, reject)
        }, delay)
      } else {
        this.enqueueTask(task, resolve, reject)
      }
    })
  }

  // Add task to queue
  private enqueueTask(task: () => Promise<void>, resolve: () => void, reject: (error: Error) => void): void {
    const wrappedTask = async () => {
      try {
        const startTime = performance.now()
        await task()
        const endTime = performance.now()
        this.metrics.processingTime = endTime - startTime
        resolve()
      } catch (error) {
        reject(error as Error)
      }
    }

    this.processingQueue.push(wrappedTask)
    this.processQueue()
  }

  // Process queue with rate limiting
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return

    this.isProcessing = true

    while (this.processingQueue.length > 0) {
      // Check if we should pause due to backpressure
      if (this.metrics.isUnderPressure && this.options.enableAdaptive) {
        await this.waitForPressureRelief()
      }

      const task = this.processingQueue.shift()
      if (task) {
        await task()

        // Small delay between tasks to prevent overwhelming
        if (this.metrics.isUnderPressure) {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }
    }

    this.isProcessing = false
  }

  // Check if backpressure should be applied
  private shouldApplyBackpressure(priority: "high" | "normal" | "low"): boolean {
    if (priority === "high") return false // High priority tasks always pass through

    return this.metrics.isUnderPressure
  }

  // Calculate adaptive delay based on pressure level
  private calculateBackpressureDelay(): number {
    const pressureLevel = this.getPressureLevel()

    switch (pressureLevel) {
      case "low":
        return 0
      case "medium":
        return 50
      case "high":
        return 200
      case "critical":
        return 500
      default:
        return 100
    }
  }

  // Get current pressure level
  // Wait for pressure to relieve
  private async waitForPressureRelief(): Promise<void> {
    return new Promise((resolve) => {
      const checkPressure = () => {
        if (!this.metrics.isUnderPressure) {
          resolve()
        } else {
          setTimeout(checkPressure, 100)
        }
      }
      checkPressure()
    })
  }

  // Get current metrics
  getMetrics(): BackpressureMetrics {
    return { ...this.metrics }
  }

  // Get pressure level (private implementation)
  getPressureLevel(): "none" | "low" | "medium" | "high" | "critical" {
    const { metrics, thresholds } = this

    const queuePressure = metrics.queueSize / thresholds.maxQueueSize
    const timePressure = metrics.processingTime / thresholds.maxProcessingTime
    const memoryPressure = metrics.memoryUsage / thresholds.maxMemoryUsage
    const framePressure = metrics.droppedFrames / thresholds.maxDroppedFrames

    const maxPressure = Math.max(queuePressure, timePressure, memoryPressure, framePressure)

    if (maxPressure < 0.5) return "none"
    if (maxPressure < 0.75) return "low"
    if (maxPressure < 1.0) return "medium"
    if (maxPressure < 1.5) return "high"
    return "critical"
  }

  // Subscribe to metrics changes
  subscribe(listener: (metrics: BackpressureMetrics) => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  // Force clear queue (emergency stop)
  clearQueue(): void {
    this.processingQueue.length = 0
    this.isProcessing = false
  }

  // Adjust thresholds
  updateThresholds(newThresholds: Partial<BackpressureThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds }
  }

  // Update options
  updateOptions(newOptions: Partial<BackpressureOptions>): void {
    this.options = { ...this.options, ...newOptions }
  }
}

// Stream consumer with backpressure integration
interface StreamConsumerOptions {
  bufferSize: number
  flushInterval: number
  enableBackpressure: boolean
  backpressureThresholds: Partial<BackpressureThresholds>
}

class StreamConsumerWithBackpressure {
  private buffer: string[] = []
  private isProcessing = false
  private backpressureController: UIBackpressureController
  private options: StreamConsumerOptions
  private flushTimer: number | null = null

  constructor(options: Partial<StreamConsumerOptions> = {}) {
    this.options = {
      bufferSize: 1000,
      flushInterval: 50,
      enableBackpressure: true,
      backpressureThresholds: {
        maxQueueSize: 50,
        maxProcessingTime: 30,
        maxRenderTime: 12,
        maxMemoryUsage: 50,
        maxDroppedFrames: 3,
      },
      ...options,
    }

    this.backpressureController = new UIBackpressureController(this.options.backpressureThresholds, {
      enableAdaptive: true,
      enableQueueLimit: true,
      enableTimeLimit: true,
      enableMemoryLimit: true,
      enableFrameLimit: true,
    })
  }

  // Add data to stream buffer
  async addData(data: string): Promise<void> {
    if (!this.options.enableBackpressure) {
      this.buffer.push(data)
      return
    }

    // Add data with backpressure consideration
    await this.backpressureController.addTask(() => {
      this.buffer.push(data)
      return Promise.resolve()
    }, "normal")
  }

  // Start processing stream data
  startProcessing(): void {
    if (this.isProcessing) return

    this.isProcessing = true
    this.flushTimer = setInterval(() => {
      this.flushBuffer()
    }, this.options.flushInterval) as unknown as number
  }

  // Stop processing stream data
  stopProcessing(): void {
    this.isProcessing = false
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  // Flush buffer to UI
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return

    const data = this.buffer.splice(0, this.options.bufferSize)

    if (this.options.enableBackpressure) {
      await this.backpressureController.addTask(() => this.processData(data), "normal")
    } else {
      await this.processData(data)
    }
  }

  // Process data (to be implemented by consumer)
  private async processData(data: string[]): Promise<void> {
    // Emit data to UI
    const event = new CustomEvent("streamData", {
      detail: { data: data.join(""), timestamp: Date.now() },
    })
    window.dispatchEvent(event)
  }

  // Get backpressure metrics
  getMetrics(): BackpressureMetrics {
    return this.backpressureController.getMetrics()
  }

  // Get pressure level
  getPressureLevel(): "none" | "low" | "medium" | "high" | "critical" {
    return this.backpressureController.getPressureLevel()
  }

  // Cleanup
  cleanup(): void {
    this.stopProcessing()
    this.buffer.length = 0
  }
}

// Global backpressure controller
export const globalBackpressureController = new UIBackpressureController()

// Reactive hook for backpressure monitoring
export function useBackpressure() {
  const [metrics, setMetrics] = createSignal<BackpressureMetrics>(globalBackpressureController.getMetrics())
  const [pressureLevel, setPressureLevel] = createSignal<"none" | "low" | "medium" | "high" | "critical">("none")

  createEffect(() => {
    const unsubscribe = globalBackpressureController.subscribe((newMetrics) => {
      setMetrics(newMetrics)
      setPressureLevel(globalBackpressureController.getPressureLevel())
    })

    onCleanup(unsubscribe)
  })

  return {
    metrics,
    pressureLevel,
    isUnderPressure: () => metrics().isUnderPressure,
    getQueueSize: () => metrics().queueSize,
    getProcessingTime: () => metrics().processingTime,
    getMemoryUsage: () => metrics().memoryUsage,
    getDroppedFrames: () => metrics().droppedFrames,
  }
}

// Backpressure indicator component
export function BackpressureIndicator(): JSX.Element {
  const backpressure = useBackpressure()

  const getIndicatorColor = () => {
    const level = backpressure.pressureLevel()
    switch (level) {
      case "none":
        return "var(--color-success)"
      case "low":
        return "var(--color-warning)"
      case "medium":
        return "var(--color-warning)"
      case "high":
        return "var(--color-error)"
      case "critical":
        return "var(--color-error)"
      default:
        return "var(--color-text-secondary)"
    }
  }

  const getIndicatorText = () => {
    const level = backpressure.pressureLevel()
    const metrics = backpressure.metrics()

    if (level === "none") return "Optimal"
    if (level === "low") return "Light Load"
    if (level === "medium") return `Moderate (${metrics.queueSize} queued)`
    if (level === "high") return `High Load (${metrics.queueSize} queued)`
    if (level === "critical") return `Critical (${metrics.queueSize} queued)`
    return "Unknown"
  }

  return (
    <div
      class="backpressure-indicator"
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "4px 8px",
        "border-radius": "12px",
        "font-size": "11px",
        "font-weight": "500",
        "background-color": getIndicatorColor() + "20",
        color: getIndicatorColor(),
        border: `1px solid ${getIndicatorColor()}40`,
      }}
    >
      <div
        class="pressure-dot"
        style={{
          width: "6px",
          height: "6px",
          "border-radius": "50%",
          "background-color": getIndicatorColor(),
          animation: backpressure.isUnderPressure() ? "pulse 2s infinite" : "none",
        }}
      />
      <span>{getIndicatorText()}</span>
    </div>
  )
}

// Export types
export type { BackpressureMetrics, BackpressureThresholds, BackpressureOptions, StreamConsumerOptions }
