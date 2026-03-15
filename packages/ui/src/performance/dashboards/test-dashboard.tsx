import { createSignal, Show } from "solid-js"

// Simple test dashboard to verify imports work
export function TestPerformanceDashboard() {
  const [isVisible, setIsVisible] = createSignal(true)
  
  return (
    <Show when={isVisible()}>
      <div style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: 'rgba(0,0,0,0.9)',
        color: 'white',
        padding: '16px',
        'border-radius': '8px',
        'font-family': 'monospace',
        'font-size': '12px',
        'z-index': '10000',
        'max-width': '300px'
      }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>
          🎛️ Test Performance Dashboard
        </div>
        <div style={{ 'margin-bottom': '4px' }}>
          Status: ✅ Working
        </div>
        <div style={{ 'margin-bottom': '4px' }}>
          Performance Systems: Active
        </div>
        <div style={{ 'margin-bottom': '8px' }}>
          This is a test dashboard to verify the import system works.
        </div>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            background: 'rgba(255,0,0,0.5)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Close
        </button>
      </div>
    </Show>
  )
}
