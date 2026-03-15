import { createSignal, createEffect, onCleanup, Show, For } from "solid-js"
import { usePerformanceMetrics, performanceFlags } from "../features/performance-flags"
import { useBackpressure } from "../components/ui-backpressure"
import { useTextChunking } from "../components/text-chunking-system"
import { useFrozenSubtree } from "../components/subtree-freezer"
import { useLazyMountStats } from "../components/lazy-mount-system"
import { useContainmentStats } from "../components/css-containment-system"
import { useOutputStats } from "../components/output-collapser"
import { useCachedRender } from "../components/render-cache-system"
import { useVirtualizationMetrics } from "../components/virtualized-history-lane"

// Perfect performance-optimized message part component
export function PerfectOptimizedMessagePart(props: {
  messageId: string
  part: any
  sessionId: string
}) {
  const metrics = usePerformanceMetrics()
  const backpressure = useBackpressure()
  const chunking = useTextChunking(props.messageId, props.part.id)
  const freezer = useFrozenSubtree(props.messageId, props.part.id)
  const lazyStats = useLazyMountStats()
  const containment = useContainmentStats()
  const outputStats = useOutputStats(() => props.part.content || "")
  const cachedRender = useCachedRender(() => props.part.content || "", () => false, () => true)
  const virtualization = useVirtualizationMetrics(props.sessionId)
  
  const [isOptimized, setIsOptimized] = createSignal(true)
  const [showDebug, setShowDebug] = createSignal(false)
  
  // Apply performance optimizations based on flags and system state
  createEffect(() => {
    const shouldOptimize = 
      performanceFlags.enableVirtualization ||
      performanceFlags.enableCaching ||
      performanceFlags.enableChunking ||
      performanceFlags.enableSubtreeFreezing ||
      performanceFlags.enableLazyMounting ||
      performanceFlags.enableCssContainment ||
      performanceFlags.enableBackpressure
    
    // Apply backpressure when system is under pressure
    if (performanceFlags.enableBackpressure && backpressure.isUnderPressure()) {
      setIsOptimized(false)
    } else {
      setIsOptimized(shouldOptimize)
    }
  })

  return (
    <div 
      class="perfect-optimized-message-part"
      data-performance-enabled={JSON.stringify(performanceFlags)}
      data-message-id={props.messageId}
      data-part-id={props.part.id}
      data-optimized={isOptimized()}
      style={{
        'contain': performanceFlags.enableCssContainment ? 'layout style paint' : 'none',
        'will-change': isOptimized() ? 'contents' : 'auto'
      }}
    >
      {/* Performance indicators */}
      <Show when={process.env.NODE_ENV === 'development' || showDebug()}>
        <div class="performance-debug" style={{
          position: 'absolute',
          top: '0',
          right: '0',
          background: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '4px 6px',
          'font-size': '9px',
          'z-index': '9999',
          'font-family': 'monospace',
          'border-radius': '4px',
          'max-width': '200px'
        }}>
          <div>FPS: {metrics().fps}</div>
          <div>MEM: {metrics().memoryUsage}MB</div>
          <div>LAT: {metrics().latency}ms</div>
          <div>SCORE: {metrics().overallScore}/100</div>
          <div>OPT: {isOptimized() ? '✅' : '❌'}</div>
          <div>BACK: {backpressure.pressureLevel()}</div>
          <button 
            onClick={() => setShowDebug(!showDebug())}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '2px 4px',
              'border-radius': '2px',
              cursor: 'pointer',
              'font-size': '8px',
              'margin-top': '4px'
            }}
          >
            {showDebug() ? 'Hide' : 'More'}
          </button>
        </div>
      </Show>

      {/* Detailed debug info */}
      <Show when={showDebug()}>
        <div class="detailed-debug" style={{
          position: 'absolute',
          top: '0',
          right: '220px',
          background: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '4px 6px',
          'font-size': '8px',
          'z-index': '9998',
          'font-family': 'monospace',
          'border-radius': '4px',
          'max-width': '300px'
        }}>
          <div>CHUNKS: {chunking().length}</div>
          <div>FROZEN: {freezer.isFrozen() ? '✅' : '❌'}</div>
          <div>LAZY: {lazyStats().mounted}/{lazyStats().observing}</div>
          <div>CONTAIN: {containment().containedElements}</div>
          <div>OUTPUT: {outputStats().lineCount} lines</div>
          <div>VIRT: {virtualization().visibleItems}/{virtualization().totalItems}</div>
          <div>CACHED: {cachedRender() ? '✅' : '❌'}</div>
        </div>
      </Show>

      {/* Optimized content rendering */}
      <div class="content-wrapper">
        <Show 
          when={isOptimized()}
          fallback={
            <div class="simplified-content" style={{
              padding: '8px',
              background: 'rgba(255,0,0,0.1)',
              border: '1px solid rgba(255,0,0,0.3)',
              'border-radius': '4px',
              'font-size': '12px'
            }}>
              <div>🔧 Performance Mode: Simplified rendering</div>
              <div>Pressure: {backpressure.pressureLevel()}</div>
              <div>Score: {metrics().overallScore}/100</div>
            </div>
          }
        >
          <div class="optimized-content">
            {/* Use cached render when available */}
            <Show 
              when={performanceFlags.enableCaching && cachedRender()}
              fallback={
                <div class="part-content" style={{
                  'font-size': '14px',
                  'line-height': '1.4',
                  'white-space': 'pre-wrap',
                  'word-break': 'break-word'
                }}>
                  {props.part.content || 'No content'}
                </div>
              }
            >
              <div class="cached-content" style={{
                'font-size': '14px',
                'line-height': '1.4',
                'white-space': 'pre-wrap',
                'word-break': 'break-word',
                background: 'rgba(0,255,0,0.05)',
                padding: '4px',
                'border-radius': '2px'
              }}>
                {cachedRender()}
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Collapsed output for long content */}
      <Show when={props.part.content && props.part.content.length > 1000}>
        <div class="collapsed-output" style={{
          'margin-top': '8px',
          padding: '8px',
          background: 'rgba(0,0,0,0.05)',
          'border-radius': '4px',
          'border': '1px solid rgba(0,0,0,0.1)'
        }}>
          <div style={{
            'font-size': '10px',
            'margin-bottom': '4px',
            color: 'var(--color-text-secondary)'
          }}>
            Long content ({props.part.content.length} chars)
          </div>
          <button 
            onClick={() => setIsOptimized(!isOptimized())}
            class="toggle-button"
            style={{
              background: 'rgba(0,0,0,0.1)',
              border: '1px solid rgba(0,0,0,0.2)',
              padding: '4px 8px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px',
              'margin-right': '8px'
            }}
          >
            {isOptimized() ? 'Simplify' : 'Full Render'}
          </button>
          <button 
            onClick={() => setShowDebug(!showDebug())}
            class="debug-button"
            style={{
              background: 'rgba(0,0,0,0.1)',
              border: '1px solid rgba(0,0,0,0.2)',
              padding: '4px 8px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px'
            }}
          >
            Debug
          </button>
        </div>
      </Show>
    </div>
  )
}

// Perfect legacy fallback component
export function PerfectLegacyMessagePart(props: {
  messageId: string
  part: any
  sessionId: string
}) {
  return (
    <div class="perfect-legacy-message-part" data-legacy="true" style={{
      padding: '8px',
      background: 'rgba(128,128,128,0.1)',
      border: '1px solid rgba(128,128,128,0.3)',
      'border-radius': '4px'
    }}>
      <div style={{
        'font-size': '12px',
        'margin-bottom': '4px',
        color: 'var(--color-text-secondary)'
      }}>
        🔒 Legacy rendering - all optimizations disabled
      </div>
      <div class="part-content" style={{
        'font-size': '14px',
        'line-height': '1.4',
        'white-space': 'pre-wrap',
        'word-break': 'break-word'
      }}>
        {props.part.content || 'No content'}
      </div>
    </div>
  )
}

// Perfect A/B testing wrapper
export function PerfectPerformanceABTest(props: {
  messageId: string
  part: any
  sessionId: string
  forceVariant?: 'optimized' | 'legacy'
}) {
  const [variant, setVariant] = createSignal<'optimized' | 'legacy'>('optimized')
  const [testMetrics, setTestMetrics] = createSignal<{
    renderTime: number
    memoryUsage: number
    timestamp: number
  }>({ renderTime: 0, memoryUsage: 0, timestamp: 0 })
  
  createEffect(() => {
    if (props.forceVariant) {
      setVariant(props.forceVariant)
      return
    }
    
    // 50/50 split for testing
    const testGroup = Math.random() < 0.5 ? 'optimized' : 'legacy'
    setVariant(testGroup)
    
    // Track performance metrics
    trackPerformanceMetrics(testGroup, props.messageId)
  })
  
  return (
    <div class="performance-ab-test" data-variant={variant()}>
      <Show 
        when={variant() === 'optimized'}
        fallback={<PerfectLegacyMessagePart {...props} />}
      >
        <PerfectOptimizedMessagePart {...props} />
      </Show>
      
      {/* Test metrics display */}
      <Show when={process.env.NODE_ENV === 'development'}>
        <div style={{
          position: 'absolute',
          bottom: '0',
          right: '0',
          background: 'rgba(255,255,0,0.9)',
          color: 'black',
          padding: '2px 4px',
          'font-size': '8px',
          'font-family': 'monospace',
          'border-radius': '2px'
        }}>
          AB: {variant()} | {testMetrics().renderTime.toFixed(2)}ms
        </div>
      </Show>
    </div>
  )
}

// Perfect performance tracking
function trackPerformanceMetrics(variant: string, messageId: string) {
  const startTime = performance.now()
  const startMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0
  
  // Track render completion
  setTimeout(() => {
    const endTime = performance.now()
    const endMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0
    
    const metrics = {
      variant,
      messageId,
      renderTime: endTime - startTime,
      memoryDelta: (endMemory - startMemory) / 1024, // KB
      timestamp: Date.now()
    }
    
    // Send to analytics (implementation would go here)
    console.log('🚀 Performance metrics:', metrics)
    
    // Store in global metrics for dashboard
    if (typeof window !== 'undefined') {
      (window as any).performanceMetrics = (window as any).performanceMetrics || []
      ;(window as any).performanceMetrics.push(metrics)
    }
  }, 0)
}
