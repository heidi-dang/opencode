import { createSignal, createEffect, onCleanup, Show, For } from "solid-js"
import { usePerformanceMetrics, performanceFlags } from "../features/performance-flags"
import { useVirtualizationMetrics } from "../components/virtualized-history-lane"
import { useRenderCache } from "../components/render-cache-system"
import { useTextChunking } from "../components/text-chunking-system"
import { useAutoFreeze } from "../components/subtree-freezer"
import { LazyMount } from "../components/lazy-mount-system"
import { useContained } from "../components/css-containment-system"
import { useBackpressure } from "../components/ui-backpressure"
import { useOutputStats } from "../components/output-collapser"

// Performance-optimized message part component
export function OptimizedMessagePart(props: {
  messageId: string
  part: any
  sessionId: string
}) {
  const metrics = usePerformanceMetrics()
  const virtualized = useVirtualizedMessage(props.messageId)
  const optimized = useOptimizedRendering(props.part)
  const chunking = useTextChunking(props.part.content || "")
  const freezer = useSubtreeFreezer(props.messageId, props.part.id)
  const lazyMount = useLazyMount()
  const containment = useCssContainment()
  const backpressure = useBackpressure()
  const collapser = useOutputCollapser(props.part.content || "", props.part.toolName)

  // Apply performance optimizations based on flags
  createEffect(() => {
    if (performanceFlags.enableVirtualization && virtualized.shouldVirtualize()) {
      virtualized.enable()
    }
    
    if (performanceFlags.enableCaching && optimized.shouldCache()) {
      optimized.enableCache()
    }
    
    if (performanceFlags.enableChunking && chunking.shouldChunk()) {
      chunking.enable()
    }
    
    if (performanceFlags.enableSubtreeFreezing && freezer.shouldFreeze()) {
      freezer.freeze()
    }
    
    if (performanceFlags.enableLazyMounting && lazyMount.shouldLazyMount()) {
      lazyMount.enable()
    }
    
    if (performanceFlags.enableCssContainment && containment.shouldContain()) {
      containment.enable()
    }
    
    if (performanceFlags.enableBackpressure && backpressure.shouldApply()) {
      backpressure.enable()
    }
  })

  return (
    <div 
      class="optimized-message-part"
      data-performance-enabled={JSON.stringify(performanceFlags)}
      data-message-id={props.messageId}
      data-part-id={props.part.id}
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
      <Show 
        when={performanceFlags.enableLazyMounting}
        fallback={<div>Loading content...</div>}
      >
        <div 
          class={containment.containedClass()}
          style={{
            'contain': performanceFlags.enableCssContainment ? 'layout style paint' : 'none'
          }}
        >
          <Show 
            when={performanceFlags.enableChunking && chunking.isChunked()}
            fallback={<div>{optimized.render()}</div>}
          >
            <For each={chunking.getChunks()}>
              {(chunk, index) => (
                <div class="text-chunk" data-chunk-index={index()}>
                  {optimized.renderChunk(chunk)}
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>

      {/* Collapsed output for long content */}
      <Show when={performanceFlags.enableOutputCollapsing && collapser.shouldCollapse()}>
        <div class="collapsed-output">
          <button 
            onClick={() => collapser.toggle()}
            class="expand-button"
          >
            Show {collapser.getCollapsedLength()} more characters
          </button>
          <div class="collapsed-preview">
            {collapser.getPreview()}
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
      {/* Original message-part.tsx content would go here */}
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
  const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
  
  // Track render completion
  setTimeout(() => {
    const endTime = performance.now()
    const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
    
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
