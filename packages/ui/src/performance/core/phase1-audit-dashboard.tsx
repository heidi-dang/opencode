import { createSignal, createEffect, Show, For } from "solid-js"
import { usePhase1SelfAudit } from "./phase1-self-audit"

// Phase 1 Self-Audit Dashboard Component
export function Phase1AuditDashboard() {
  const audit = usePhase1SelfAudit()
  const [isExpanded, setIsExpanded] = createSignal(false)
  
  const runAudit = async () => {
    await audit.runAudit()
  }
  
  return (
    <div class="phase1-audit-dashboard" style={{
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
      'max-width': '400px'
    }}>
      <div style={{
        'font-weight': 'bold',
        'margin-bottom': '12px',
        'font-size': '14px'
      }}>
        🔍 Phase 1 Self-Audit
      </div>
      
      {/* Audit Status */}
      <Show when={audit.isRunning()}>
        <div style={{
          background: 'rgba(255,165,0,0.2)',
          padding: '8px',
          'border-radius': '4px',
          'margin-bottom': '12px',
          'text-align': 'center'
        }}>
          🔄 Running Audit...
        </div>
      </Show>
      
      {/* Audit Results */}
      <Show when={audit.report()}>
        <div style={{
          background: audit.report()!.overallPassed ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>
            Overall: {audit.report()!.grade} ({audit.report()!.averageScore.toFixed(1)}%)
          </div>
          <div style={{ 'font-size': '10px', 'margin-bottom': '4px' }}>
            Status: {audit.report()!.overallPassed ? '✅ PASS' : '❌ FAIL'}
          </div>
          <div style={{ 'font-size': '10px', 'margin-bottom': '4px' }}>
            Categories: {audit.report()!.passedCategories}/{audit.report()!.totalCategories} passed
          </div>
          <div style={{ 'font-size': '10px' }}>
            Duration: {audit.report()!.auditDuration}ms
          </div>
        </div>
      </Show>
      
      {/* Category Results */}
      <Show when={audit.report() && isExpanded()}>
        <div style={{
          'margin-bottom': '12px',
          'max-height': '300px',
          'overflow-y': 'auto'
        }}>
          <For each={audit.report()!.results}>
            {(result) => (
              <div style={{
                background: result.status === 'PASS' ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)',
                padding: '8px',
                'margin-bottom': '4px',
                'border-radius': '4px'
              }}>
                <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>
                  {result.category}: {result.status} ({result.score}%)
                </div>
                <Show when={result.issues.length > 0}>
                  <div style={{ 'font-size': '10px', 'margin-bottom': '2px' }}>
                    Issues: {result.issues.length}
                  </div>
                </Show>
                <Show when={result.recommendations.length > 0}>
                  <div style={{ 'font-size': '10px' }}>
                    Recommendations: {result.recommendations.length}
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      
      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={runAudit}
          disabled={audit.isRunning()}
          style={{
            background: audit.isRunning() ? 'rgba(128,128,128,0.5)' : 'rgba(0,255,0,0.5)',
            border: 'none',
            color: 'white',
            padding: '8px 12px',
            'border-radius': '4px',
            cursor: audit.isRunning() ? 'not-allowed' : 'pointer',
            'font-size': '10px',
            flex: 1
          }}
        >
          {audit.isRunning() ? 'Running...' : 'Run Audit'}
        </button>
        
        <Show when={audit.report()}>
          <button
            onClick={() => setIsExpanded(!isExpanded())}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '8px 12px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '10px'
            }}
          >
            {isExpanded() ? 'Hide' : 'Details'}
          </button>
        </Show>
      </div>
    </div>
  )
}
