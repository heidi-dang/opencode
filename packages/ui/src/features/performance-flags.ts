import { createSignal, createEffect, onCleanup } from "solid-js"

// Feature flags for performance optimizations
export const performanceFlags = {
  enableVirtualization: process.env.NODE_ENV === 'production',
  enableCaching: true,
  enableChunking: true,
  enableSubtreeFreezing: true,
  enableBackpressure: true,
  enableLazyMounting: true,
  enableCssContainment: true,
  enableOutputCollapsing: true
}

// Performance metrics interface
export interface PerformanceMetrics {
  fps: number
  memoryUsage: number
  latency: number
  renderTime: number
  overallScore: number
}

// Performance monitoring hook
export function usePerformanceMetrics() {
  const [metrics, setMetrics] = createSignal<PerformanceMetrics>({
    fps: 60,
    memoryUsage: 0,
    latency: 0,
    renderTime: 0,
    overallScore: 95
  })

  let frameCount = 0
  let lastTime = performance.now()
  let animationId: number

  const measureFPS = () => {
    frameCount++
    const currentTime = performance.now()
    
    if (currentTime >= lastTime + 1000) {
      const fps = Math.round((frameCount * 1000) / (currentTime - lastTime))
      
      setMetrics(prev => ({
        ...prev,
        fps,
        memoryUsage: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : prev.memoryUsage,
        latency: Math.round(currentTime - lastTime),
        overallScore: calculateOverallScore({ fps, memoryUsage: prev.memoryUsage, latency: currentTime - lastTime, renderTime: prev.renderTime })
      }))
      
      frameCount = 0
      lastTime = currentTime
    }
    
    animationId = requestAnimationFrame(measureFPS)
  }

  // Start monitoring
  animationId = requestAnimationFrame(measureFPS)

  onCleanup(() => {
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
  })

  return metrics
}

// Calculate overall performance score
function calculateOverallScore(metrics: Omit<PerformanceMetrics, 'overallScore'>): number {
  let score = 100
  
  // FPS scoring (60fps = 100%, 30fps = 0%)
  const fpsScore = Math.max(0, Math.min(100, (metrics.fps - 30) * 2))
  score = score * 0.3 + fpsScore * 0.7
  
  // Memory usage penalty (>100MB)
  if (metrics.memoryUsage > 100) {
    score -= (metrics.memoryUsage - 100) * 0.1
  }
  
  // Latency penalty (>100ms)
  if (metrics.latency > 100) {
    score -= (metrics.latency - 100) * 0.05
  }
  
  return Math.round(Math.max(0, Math.min(100, score)))
}

// Performance regression detection
export class PerformanceGuard {
  private thresholds = {
    maxRenderTime: 16, // ms
    maxMemoryUsage: 100, // MB
    minFps: 55
  }
  
  checkRegression(metrics: PerformanceMetrics): string[] {
    const regressions = []
    
    if (metrics.renderTime > this.thresholds.maxRenderTime) {
      regressions.push('Render time exceeded threshold')
    }
    
    if (metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
      regressions.push('Memory usage exceeded threshold')
    }
    
    if (metrics.fps < this.thresholds.minFps) {
      regressions.push('FPS below threshold')
    }
    
    return regressions
  }
  
  fallbackToLegacy() {
    console.warn('Performance regression detected, falling back to legacy mode')
    // Implementation for fallback would go here
  }
}
