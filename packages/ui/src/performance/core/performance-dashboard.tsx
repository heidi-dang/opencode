import { createSignal, createEffect, Show } from "solid-js"
import { usePerformanceMetrics, PerformanceGuard } from "../features/performance-flags"

// Performance dashboard component
export function PerformanceDashboard() {
  const metrics = usePerformanceMetrics()
  const [isVisible, setIsVisible] = createSignal(false)
  const [showDebug, setShowDebug] = createSignal(false)
  
  const guard = new PerformanceGuard()
  
  // Check for performance regressions
  createEffect(() => {
    const currentMetrics = metrics.metrics
    if (currentMetrics) {
      const regressions = guard.checkRegression()
      if (regressions) {
        console.warn('Performance regressions detected')
        // Could show user notification here
      }
    }
  })
  
  const toggleVisibility = () => setIsVisible(!isVisible())
  const toggleDebug = () => setShowDebug(!showDebug())
  
  return (
    <div class="performance-dashboard">
      {/* Toggle Button */}
      <button
        onClick={toggleVisibility}
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          border: 'none',
          padding: '8px',
          'border-radius': '4px',
          cursor: 'pointer',
          'z-index': '1000'
        }}
      >
        {isVisible() ? 'Hide' : 'Show'} Performance
      </button>
      
      {/* Dashboard Content */}
      <Show when={isVisible()}>
        <div
          style={{
            position: 'fixed',
            top: '50px',
            right: '10px',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '16px',
            'border-radius': '8px',
            'font-family': 'monospace',
            'font-size': '12px',
            'z-index': '999',
            'min-width': '300px',
            'max-width': '400px'
          }}
        >
          <h3 style={{ 'margin-top': '0', 'margin-bottom': '12px' }}>Performance Dashboard</h3>
          
          {/* Performance Metrics */}
          <div style={{ 'margin-bottom': '12px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Metrics:</div>
            <div>FPS: {metrics.metrics.fps}</div>
            <div>Memory: {metrics.metrics.memoryUsage}MB</div>
            <div>Latency: {metrics.metrics.latency}ms</div>
            <div>Score: {metrics.metrics.score}/100</div>
          </div>
          
          {/* Debug Info */}
          <Show when={showDebug()}>
            <div style={{ 'margin-bottom': '12px' }}>
              <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Debug Info:</div>
              <div>Timestamp: {new Date().toISOString()}</div>
              <div>User Agent: {typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) + '...' : 'N/A'}</div>
              <div>Viewport: {typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}</div>
            </div>
          </Show>
          
          {/* Controls */}
          <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '12px' }}>
            <button
              onClick={toggleDebug}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              {showDebug() ? 'Hide Debug' : 'Show Debug'}
            </button>
            
            <button
              onClick={() => metrics.setMetrics()}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Refresh
            </button>
          </div>
          
          {/* Performance Score */}
          <div style={{ 'margin-bottom': '12px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Performance Score:</div>
            <div style={{
              background: metrics.metrics.score > 80 ? 'rgba(0,255,0,0.3)' : 
                         metrics.metrics.score > 60 ? 'rgba(255,255,0,0.3)' : 
                         'rgba(255,0,0,0.3)',
              padding: '8px',
              'border-radius': '4px',
              'text-align': 'center'
            }}>
              {metrics.metrics.score}/100
            </div>
          </div>
          
          {/* Recommendations */}
          <div style={{ 'margin-bottom': '12px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Recommendations:</div>
            <Show when={metrics.metrics.fps < 30}>
              <div style={{ color: '#ff6b6b' }}>⚠️ Low FPS detected</div>
            </Show>
            <Show when={metrics.metrics.memoryUsage > 100}>
              <div style={{ color: '#ff6b6b' }}>⚠️ High memory usage</div>
            </Show>
            <Show when={metrics.metrics.latency > 100}>
              <div style={{ color: '#ff6b6b' }}>⚠️ High latency</div>
            </Show>
            <Show when={metrics.metrics.score > 80}>
              <div style={{ color: '#51cf66' }}>✅ Performance is optimal</div>
            </Show>
          </div>
          
          {/* Close Button */}
          <button
            onClick={toggleVisibility}
            style={{
              background: 'rgba(255,0,0,0.5)',
              border: 'none',
              color: 'white',
              padding: '4px 8px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px',
              width: '100%'
            }}
          >
            Close Dashboard
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
        top: '10px',
        right: '10px',
        background: metrics.metrics.score > 80 ? 'rgba(0,255,0,0.8)' : 
                   metrics.metrics.score > 60 ? 'rgba(255,255,0,0.8)' : 
                   'rgba(255,0,0,0.8)',
        color: 'white',
        padding: '4px 8px',
        'border-radius': '4px',
        'font-size': '10px',
        'font-weight': 'bold',
        'z-index': '1001'
      }}
    >
      {metrics.metrics.score}/100
    </div>
  )
}
