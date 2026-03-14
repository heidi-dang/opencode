// PERFORMANCE: Performance monitoring and metrics collection
export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics = new Map<string, PerformanceMetric>()
  private observers: PerformanceObserver[] = []

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  constructor() {
    this.setupObservers()
  }

  private setupObservers() {
    // PERFORMANCE: Monitor navigation timing
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming
            this.recordMetric('page.load', navEntry.loadEventEnd - navEntry.loadEventStart)
            this.recordMetric('page.domContentLoaded', navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart)
          }
        }
      })
      navObserver.observe({ entryTypes: ['navigation'] })
      this.observers.push(navObserver)

      // PERFORMANCE: Monitor resource loading
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming
            this.recordMetric(`resource.${resource.name}`, resource.duration)
          }
        }
      })
      resourceObserver.observe({ entryTypes: ['resource'] })
      this.observers.push(resourceObserver)
    }
  }

  startTimer(name: string): () => void {
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      this.recordMetric(name, duration)
    }
  }

  recordMetric(name: string, value: number) {
    const existing = this.metrics.get(name) || {
      count: 0,
      total: 0,
      min: Infinity,
      max: -Infinity,
      avg: 0
    }

    const updated = {
      count: existing.count + 1,
      total: existing.total + value,
      min: Math.min(existing.min, value),
      max: Math.max(existing.max, value),
      avg: (existing.total + value) / (existing.count + 1)
    }

    this.metrics.set(name, updated)
  }

  getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name)
  }

  getAllMetrics(): Record<string, PerformanceMetric> {
    return Object.fromEntries(this.metrics)
  }

  // PERFORMANCE: Get performance score
  getScore(): number {
    const metrics = this.getAllMetrics()
    let score = 100

    // Deduct points for slow operations
    Object.entries(metrics).forEach(([name, metric]) => {
      if (name.includes('render') && metric.avg > 16) score -= 10 // 60fps = 16ms
      if (name.includes('load') && metric.avg > 1000) score -= 15 // 1 second load time
      if (name.includes('memory') && metric.avg > 100) score -= 5 // High memory usage
    })

    return Math.max(0, score)
  }

  cleanup() {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
    this.metrics.clear()
  }
}

export interface PerformanceMetric {
  count: number
  total: number
  min: number
  max: number
  avg: number
}

// PERFORMANCE: Global performance hooks
export const usePerformance = () => {
  const monitor = PerformanceMonitor.getInstance()

  return {
    startTimer: (name: string) => monitor.startTimer(name),
    recordMetric: (name: string, value: number) => monitor.recordMetric(name, value),
    getMetric: (name: string) => monitor.getMetric(name),
    getScore: () => monitor.getScore(),
    getAllMetrics: () => monitor.getAllMetrics()
  }
}
