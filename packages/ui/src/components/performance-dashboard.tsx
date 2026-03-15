import { createSignal, createEffect, Show } from "solid-js"
import { usePerformanceMetrics, performanceFlags } from "../features/performance-flags"
import { PerformanceGuard } from "../features/performance-flags"

// Performance dashboard component
export function PerformanceDashboard() {
  const metrics = usePerformanceMetrics()
  const [isVisible, setIsVisible] = createSignal(false)
  const [showDebug, setShowDebug] = createSignal(false)
  
  const guard = new PerformanceGuard()
  
  // Check for performance regressions
  createEffect(() => {
    const regressions = guard.checkRegression(metrics())
    if (regressions.length > 0) {
      console.warn('Performance regressions detected:', regressions)
      // Could show user notification here
    }
  })
  
  const toggleVisibility = () => setIsVisible(!isVisible())
  const toggleDebug = () => setShowDebug(!showDebug())
  
  return (
    <div class="performance-dashboard">
      {/* Toggle Button */}
      <button
        onClick={toggleVisibility}
        class="performance-toggle"
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          'z-index': '9999',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          border: 'none',
          padding: '8px 12px',
          'border-radius': '4px',
          cursor: 'pointer',
          'font-size': '12px'
        }}
      >
        🚀 Perf: {metrics().overallScore}/100
      </button>
      
      {/* Performance Panel */}
      <Show when={isVisible()}>
        <div 
          class="performance-panel"
          style={{
            position: 'fixed',
            top: '50px',
            right: '10px',
            width: '300px',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '16px',
            'border-radius': '8px',
            'z-index': '9999',
            'font-family': 'monospace',
            'font-size': '12px',
            'line-height': '1.4'
          }}
        >
          <h3 style="margin: 0 0 12px 0; font-size: 14px;">Performance Metrics</h3>
          
          {/* Core Metrics */}
          <div style="margin-bottom: 12px;">
            <div>FPS: <span style={{ 
              color: metrics().fps >= 55 ? '#4ade80' : metrics().fps >= 30 ? '#fbbf24' : '#ef4444' 
            }}>{metrics().fps}</span></div>
            <div>Memory: <span style={{ 
              color: metrics().memoryUsage <= 100 ? '#4ade80' : metrics().memoryUsage <= 150 ? '#fbbf24' : '#ef4444' 
            }}>{metrics().memoryUsage}MB</span></div>
            <div>Latency: <span style={{ 
              color: metrics().latency <= 50 ? '#4ade80' : metrics().latency <= 100 ? '#fbbf24' : '#ef4444' 
            }}>{metrics().latency}ms</span></div>
            <div>Render Time: <span style={{ 
              color: metrics().renderTime <= 16 ? '#4ade80' : metrics().renderTime <= 33 ? '#fbbf24' : '#ef4444' 
            }}>{metrics().renderTime}ms</span></div>
          </div>
          
          {/* Overall Score */}
          <div style="margin-bottom: 16px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
            <div style="font-weight: bold;">Overall Score: {metrics().overallScore}/100</div>
            <div style="font-size: 10px; opacity: 0.8;">
              {metrics().overallScore >= 95 ? 'Excellent' : 
               metrics().overallScore >= 85 ? 'Good' : 
               metrics().overallScore >= 70 ? 'Fair' : 'Poor'}
            </div>
          </div>
          
          {/* Feature Flags */}
          <div style="margin-bottom: 12px;">
            <h4 style="margin: 0 0 8px 0; font-size: 12px;">Enabled Features</h4>
            <div style="font-size: 10px;">
              <div>🎯 Virtualization: {performanceFlags.enableVirtualization ? '✅' : '❌'}</div>
              <div>💾 Caching: {performanceFlags.enableCaching ? '✅' : '❌'}</div>
              <div>📝 Chunking: {performanceFlags.enableChunking ? '✅' : '❌'}</div>
              <div>🧊 Subtree Freezing: {performanceFlags.enableSubtreeFreezing ? '✅' : '❌'}</div>
              <div>⚡ Backpressure: {performanceFlags.enableBackpressure ? '✅' : '❌'}</div>
              <div>🔄 Lazy Mounting: {performanceFlags.enableLazyMounting ? '✅' : '❌'}</div>
              <div>📦 CSS Containment: {performanceFlags.enableCssContainment ? '✅' : '❌'}</div>
            </div>
          </div>
          
          {/* Debug Info */}
          <button
            onClick={toggleDebug}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '4px 8px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px',
              width: '100%',
              'margin-bottom': '8px'
            }}
          >
            {showDebug() ? 'Hide' : 'Show'} Debug Info
          </button>
          
          <Show when={showDebug()}>
            <div style="font-size: 10px; opacity: 0.8;">
              <div>Node Env: {process.env.NODE_ENV}</div>
              <div>User Agent: {navigator.userAgent.slice(0, 50)}...</div>
              <div>CPU Cores: {navigator.hardwareConcurrency}</div>
              <div>Device Memory: {navigator.deviceMemory}GB</div>
              <div>Connection: {navigator.connection?.effectiveType || 'Unknown'}</div>
              <div>Pixel Ratio: {window.devicePixelRatio}</div>
            </div>
          </Show>
          
          {/* Close Button */}
          <button
            onClick={toggleVisibility}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '4px 8px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px',
              width: '100%'
            }}
          >
            Close
          </button>
        </div>
      </Show>
    </div>
  )
}

// Performance indicator for minimal view
export function PerformanceIndicator() {
  const metrics = usePerformanceMetrics()
  
  return (
    <div 
      class="performance-indicator-mini"
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '4px 8px',
        'border-radius': '12px',
        'font-size': '10px',
        'z-index': '9999',
        'font-family': 'monospace'
      }}
      title={`Performance: ${metrics().overallScore}/100 | FPS: ${metrics().fps} | Memory: ${metrics().memoryUsage}MB`}
    >
      <span style={{ 
        color: metrics().overallScore >= 95 ? '#4ade80' : 
               metrics().overallScore >= 85 ? '#fbbf24' : '#ef4444' 
      }}>
        🚀 {metrics().overallScore}/100
      </span>
    </div>
  )
}
