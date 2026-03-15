import { createSignal, createEffect, Show, For } from "solid-js"
import { usePerformanceMetrics } from "../features/performance-flags"
import { performanceRollout, usePerformanceRollout } from "./gradual-rollout"

// Enhanced performance regression detection
export class EnhancedPerformanceGuard {
  private thresholds = {
    maxRenderTime: 16, // ms
    maxMemoryUsage: 100, // MB
    minFps: 55,
    maxLatency: 100, // ms
    minScore: 85 // overall score
  }
  
  private regressionCount = 0
  private maxRegressions = 3
  private fallbackMode = false
  
  checkRegression(metrics: any): string[] {
    const regressions = []
    
    if (metrics.renderTime > this.thresholds.maxRenderTime) {
      regressions.push(`Render time ${metrics.renderTime}ms exceeded threshold ${this.thresholds.maxRenderTime}ms`)
    }
    
    if (metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
      regressions.push(`Memory usage ${metrics.memoryUsage}MB exceeded threshold ${this.thresholds.maxMemoryUsage}MB`)
    }
    
    if (metrics.fps < this.thresholds.minFps) {
      regressions.push(`FPS ${metrics.fps} below threshold ${this.thresholds.minFps}`)
    }
    
    if (metrics.latency > this.thresholds.maxLatency) {
      regressions.push(`Latency ${metrics.latency}ms exceeded threshold ${this.thresholds.maxLatency}ms`)
    }
    
    if (metrics.overallScore < this.thresholds.minScore) {
      regressions.push(`Overall score ${metrics.overallScore} below threshold ${this.thresholds.minScore}`)
    }
    
    if (regressions.length > 0) {
      this.regressionCount++
      console.warn(`Performance regression #${this.regressionCount}:`, regressions)
      
      if (this.regressionCount >= this.maxRegressions) {
        this.fallbackToLegacy()
      }
    } else {
      // Reset regression count on good performance
      this.regressionCount = Math.max(0, this.regressionCount - 1)
    }
    
    return regressions
  }
  
  fallbackToLegacy() {
    if (!this.fallbackMode) {
      this.fallbackMode = true
      console.error('🚨 Performance regression threshold reached, falling back to legacy mode')
      
      // Store fallback state
      if (typeof window !== 'undefined') {
        localStorage.setItem('performance-fallback-mode', 'true')
        localStorage.setItem('performance-fallback-timestamp', Date.now().toString())
      }
    }
  }
  
  isInFallbackMode(): boolean {
    return this.fallbackMode
  }
  
  resetFallbackMode() {
    this.fallbackMode = false
    this.regressionCount = 0
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('performance-fallback-mode')
      localStorage.removeItem('performance-fallback-timestamp')
    }
  }
  
  getRegressionCount(): number {
    return this.regressionCount
  }
}

// Global enhanced guard instance
export const enhancedPerformanceGuard = new EnhancedPerformanceGuard()

// Performance safety wrapper component
export function PerformanceSafetyWrapper(props: {
  children: any
  fallback?: any
}) {
  const metrics = usePerformanceMetrics()
  const rollout = usePerformanceRollout()
  const [regressions, setRegressions] = createSignal<string[]>([])
  const [inFallback, setInFallback] = createSignal(false)
  
  createEffect(() => {
    const currentRegressions = enhancedPerformanceGuard.checkRegression(metrics.metrics)
    setRegressions(currentRegressions)
    setInFallback(enhancedPerformanceGuard.isInFallbackMode())
  })
  
  return (
    <div class="performance-safety-wrapper" data-fallback={inFallback()}>
      {/* Safety indicators */}
      <Show when={process.env.NODE_ENV === 'development' || regressions().length > 0}>
        <div class="safety-indicators" style={{
          position: 'fixed',
          top: '60px',
          left: '10px',
          background: inFallback() ? 'rgba(255,0,0,0.9)' : 'rgba(255,165,0,0.9)',
          color: 'white',
          padding: '8px 12px',
          'border-radius': '4px',
          'font-size': '11px',
          'font-family': 'monospace',
          'z-index': '9998',
          'max-width': '300px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>
            {inFallback() ? '🚨 FALLBACK MODE' : '⚠️ Performance Issues'}
          </div>
          <div>Regressions: {regressions().length}</div>
          <div>Tier: {rollout().userTier}</div>
          <div>Score: {metrics.metrics.score}/100</div>
          
          <Show when={regressions().length > 0}>
            <div style={{ 'margin-top': '8px', 'font-size': '9px' }}>
              <For each={regressions().slice(0, 3)}>
                {(reg) => <div>• {reg}</div>}
              </For>
            </div>
          </Show>
          
          <Show when={inFallback()}>
            <button
              onClick={() => enhancedPerformanceGuard.resetFallbackMode()}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '2px',
                cursor: 'pointer',
                'font-size': '9px',
                'margin-top': '8px'
              }}
            >
              Reset Fallback
            </button>
          </Show>
        </div>
      </Show>
      
      {/* Render children or fallback */}
      <Show 
        when={!inFallback()}
        fallback={props.fallback || (
          <div class="fallback-content" style={{
            padding: '16px',
            background: 'rgba(255,0,0,0.1)',
            border: '1px solid rgba(255,0,0,0.3)',
            'border-radius': '4px',
            'text-align': 'center'
          }}>
            <div style={{ 'font-size': '16px', 'margin-bottom': '8px' }}>
              🚨 Performance Fallback Mode
            </div>
            <div style={{ 'font-size': '12px', color: 'var(--color-text-secondary)' }}>
              Advanced optimizations disabled due to performance issues
            </div>
          </div>
        )}
      >
        {props.children}
      </Show>
    </div>
  )
}
