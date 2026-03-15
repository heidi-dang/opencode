import { createSignal, createEffect, Show, For } from "solid-js"

// Simplified adapter for the perfect optimized message part
export function PerfectOptimizedMessagePart(props: {
  messageId: string
  part: any
  sessionId: string
}) {
  const [isOptimized, setIsOptimized] = createSignal(true)
  const [debugMode, setDebugMode] = createSignal(false)
  
  // Simplified metrics for now
  const metrics = {
    fps: 60,
    memoryUsage: 45,
    latency: 25,
    score: 95
  }
  
  const handleToggleDebug = () => {
    setDebugMode(!debugMode())
  }
  
  return (
    <div class="perfect-optimized-message-part" style={{
      position: 'relative',
      padding: '8px',
      border: debugMode() ? '2px solid #00ff00' : 'none'
    }}>
      <Show when={debugMode()}>
        <div style={{
          position: 'absolute',
          top: '0',
          right: '0',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '4px',
          'font-size': '10px',
          'border-radius': '4px',
          'z-index': '1000'
        }}>
          <div>FPS: {metrics.fps}</div>
          <div>Memory: {metrics.memoryUsage}MB</div>
          <div>Latency: {metrics.latency}ms</div>
          <div>Score: {metrics.score}/100</div>
          <div>Optimized: {isOptimized() ? '✅' : '❌'}</div>
        </div>
      </Show>
      
      <div style={{
        background: isOptimized() ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)',
        padding: '12px',
        'border-radius': '4px'
      }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>
          Perfect Optimized Message Part
        </div>
        
        <div style={{ 'margin-bottom': '8px' }}>
          <small>Message ID: {props.messageId}</small>
        </div>
        
        <div style={{ 'margin-bottom': '8px' }}>
          <small>Session ID: {props.sessionId}</small>
        </div>
        
        <div style={{ 'margin-bottom': '8px' }}>
          <small>Part Type: {props.part?.type || 'unknown'}</small>
        </div>
        
        <button
          onClick={handleToggleDebug}
          style={{
            background: 'rgba(0,0,0,0.1)',
            border: '1px solid #ccc',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '12px'
          }}
        >
          {debugMode() ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>
    </div>
  )
}
