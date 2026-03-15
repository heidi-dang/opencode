import { createSignal, createEffect, onCleanup, Show, For } from "solid-js"
import { usePerformanceMetrics, performanceFlags } from "../features/performance-flags"
import { useBackpressure } from "../components/ui-backpressure"
import { outputCollapser } from "../components/output-collapser"

// Simplified performance-optimized message part component
export function OptimizedMessagePart(props: {
  messageId: string
  part: any
  sessionId: string
}) {
  const metrics = usePerformanceMetrics()
  const backpressure = useBackpressure()
  const [isOptimized, setIsOptimized] = createSignal(true)
  
  // Apply performance optimizations based on flags
  createEffect(() => {
    if (performanceFlags.enableVirtualization) {
      // Virtualization logic would go here
    }
    
    if (performanceFlags.enableCaching) {
      // Caching logic would go here
    }
    
    if (performanceFlags.enableChunking) {
      // Chunking logic would go here
    }
    
    if (performanceFlags.enableSubtreeFreezing) {
      // Subtree freezing logic would go here
    }
    
    if (performanceFlags.enableLazyMounting) {
      // Lazy mounting logic would go here
    }
    
    if (performanceFlags.enableCssContainment) {
      // CSS containment logic would go here
    }
    
    if (performanceFlags.enableBackpressure && backpressure.isUnderPressure()) {
      // Enable backpressure when system is under pressure
      setIsOptimized(false) // Simplified backpressure response
    }
  })

  return (
    <div 
      class="optimized-message-part"
      data-performance-enabled={JSON.stringify(performanceFlags)}
      data-message-id={props.messageId}
      data-part-id={props.part.id}
      style={{
        'contain': performanceFlags.enableCssContainment ? 'layout style paint' : 'none'
      }}
    >
      {/* Performance indicators */}
      <Show when={process.env.NODE_ENV === 'development'}>
        <div class="performance-debug" style={{
          position: 'absolute',
          top: '0',
          right: '0',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '2px 4px',
          'font-size': '10px',
          'z-index': '9999'
        }}>
          FPS: {metrics().fps} | MEM: {metrics().memoryUsage}MB | LAT: {metrics().latency}ms
        </div>
      </Show>

      {/* Optimized content rendering */}
      <div class="content-wrapper">
        <Show 
          when={isOptimized()}
          fallback={<div>Performance mode: Simplified rendering</div>}
        >
          <div class="optimized-content">
            {/* Render part content with optimizations */}
            <div class="part-content">
              {props.part.content || 'No content'}
            </div>
          </div>
        </Show>
      </div>

      {/* Collapsed output for long content */}
      <Show when={props.part.content && props.part.content.length > 1000}>
        <div class="collapsed-output">
          <button 
            onClick={() => setIsOptimized(!isOptimized())}
            class="toggle-button"
            style={{
              background: 'rgba(0,0,0,0.1)',
              border: '1px solid rgba(0,0,0,0.2)',
              padding: '4px 8px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px'
            }}
          >
            {isOptimized() ? 'Show simplified' : 'Show full content'}
          </button>
          <div class="content-preview" style={{
            'margin-top': '8px',
            padding: '8px',
            background: 'rgba(0,0,0,0.05)',
            'border-radius': '4px',
            'font-size': '12px'
          }}>
            {isOptimized() ? 
              props.part.content.substring(0, 200) + '...' : 
              props.part.content
            }
          </div>
        </div>
      </Show>
    </div>
  )
}

// Legacy fallback component
export function LegacyMessagePart(props: {
  messageId: string
  part: any
  sessionId: string
}) {
  return (
    <div class="legacy-message-part" data-legacy="true">
      <div>Legacy rendering - performance optimizations disabled</div>
      <div class="part-content">
        {props.part.content || 'No content'}
      </div>
    </div>
  )
}

// A/B testing wrapper
export function PerformanceABTest(props: {
  messageId: string
  part: any
  sessionId: string
  forceVariant?: 'optimized' | 'legacy'
}) {
  const [variant, setVariant] = createSignal<'optimized' | 'legacy'>('optimized')
  
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
    <Show 
      when={variant() === 'optimized'}
      fallback={<LegacyMessagePart {...props} />}
    >
      <OptimizedMessagePart {...props} />
    </Show>
  )
}

// Performance tracking
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
    console.log('Performance metrics:', metrics)
  }, 0)
}
