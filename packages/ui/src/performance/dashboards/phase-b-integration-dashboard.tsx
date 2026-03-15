import { createSignal, createEffect, Show, For } from "solid-js"
import { useFeatureFlags } from "../shared/feature-flags"
import { useIntegrationManager } from "../shared/integration-manager"
import { usePerformanceManager } from "../manager"

// Phase B Integration Dashboard
export function PhaseBIntegrationDashboard() {
  const featureFlags = useFeatureFlags()
  const integration = useIntegrationManager()
  const performance = usePerformanceManager()
  
  const [activeTab, setActiveTab] = createSignal<'flags' | 'integration' | 'testing' | 'monitoring'>('flags')
  
  return (
    <div class="phase-b-integration-dashboard" style={{
      position: 'fixed',
      top: '10px',
      left: '10px',
      background: 'rgba(0,0,0,0.95)',
      color: 'white',
      padding: '16px',
      'border-radius': '8px',
      'font-family': 'monospace',
      'font-size': '12px',
      'z-index': '10000',
      'max-width': '600px',
      'max-height': '80vh',
      'overflow-y': 'auto'
    }}>
      {/* Header */}
      <div style={{
        'font-weight': 'bold',
        'margin-bottom': '12px',
        'font-size': '14px',
        'text-align': 'center'
      }}>
        🔧 Phase B Integration Dashboard
      </div>
      
      {/* Integration Status Overview */}
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        padding: '12px',
        'border-radius': '4px',
        'margin-bottom': '12px'
      }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Integration Status</div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Progress: {(featureFlags.getProgress() * 100).toFixed(1)}%
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Core: {integration.status().phases.core ? '✅' : '❌'}
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Safety: {integration.status().phases.safety ? '✅' : '❌'}
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Advanced: {integration.status().phases.advanced ? '✅' : '❌'}
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Status: {integration.isIntegrating() ? '🔄 Integrating' : '⏸️ Idle'}
        </div>
      </div>
      
      {/* Feature Flags Tab */}
      <Show when={activeTab() === 'flags'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Feature Flags</div>
          
          {/* Core Flags */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Core Phase:</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <For each={Object.entries(featureFlags.flags()).filter(([key]) => key.startsWith('core.'))}>
                {([key, value]) => (
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
                    <span style={{ 'font-size': '10px' }}>{key.replace('core.', '')}</span>
                    <button
                      onClick={() => featureFlags.toggleFlag(key)}
                      style={{
                        background: value ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
                        border: 'none',
                        color: 'white',
                        padding: '2px 6px',
                        'border-radius': '2px',
                        cursor: 'pointer',
                        'font-size': '9px'
                      }}
                    >
                      {value ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
          
          {/* Safety Flags */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Safety Phase:</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <For each={Object.entries(featureFlags.flags()).filter(([key]) => key.startsWith('safety.'))}>
                {([key, value]) => (
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
                    <span style={{ 'font-size': '10px' }}>{key.replace('safety.', '')}</span>
                    <button
                      onClick={() => featureFlags.toggleFlag(key)}
                      style={{
                        background: value ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
                        border: 'none',
                        color: 'white',
                        padding: '2px 6px',
                        'border-radius': '2px',
                        cursor: 'pointer',
                        'font-size': '9px'
                      }}
                    >
                      {value ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
          
          {/* Advanced Flags */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Advanced Phase:</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <For each={Object.entries(featureFlags.flags()).filter(([key]) => key.startsWith('advanced.'))}>
                {([key, value]) => (
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
                    <span style={{ 'font-size': '10px' }}>{key.replace('advanced.', '')}</span>
                    <button
                      onClick={() => featureFlags.toggleFlag(key)}
                      style={{
                        background: value ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
                        border: 'none',
                        color: 'white',
                        padding: '2px 6px',
                        'border-radius': '2px',
                        cursor: 'pointer',
                        'font-size': '9px'
                      }}
                    >
                      {value ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'margin-top': '8px' }}>
            <button
              onClick={() => featureFlags.enablePhase('core')}
              style={{
                background: 'rgba(0,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Enable Core
            </button>
            
            <button
              onClick={() => featureFlags.enablePhase('safety')}
              style={{
                background: 'rgba(0,165,255,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Enable Safety
            </button>
            
            <button
              onClick={() => featureFlags.enablePhase('advanced')}
              style={{
                background: 'rgba(255,165,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Enable Advanced
            </button>
            
            <button
              onClick={() => featureFlags.reset()}
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
              Reset All
            </button>
          </div>
        </div>
      </Show>
      
      {/* Integration Tab */}
      <Show when={activeTab() === 'integration'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Integration Control</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Current Phase: {integration.status().currentPhase}</div>
            <div>Progress: {(integration.status().progress * 100).toFixed(1)}%</div>
            <div>Status: {integration.isIntegrating() ? 'Integrating' : 'Idle'}</div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <button
              onClick={() => integration.startIntegration()}
              disabled={integration.isIntegrating()}
              style={{
                background: integration.isIntegrating() ? 'rgba(128,128,128,0.5)' : 'rgba(0,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: integration.isIntegrating() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              Start Integration
            </button>
            
            <button
              onClick={() => integration.enablePhaseManually('core')}
              style={{
                background: 'rgba(0,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Enable Core
            </button>
            
            <button
              onClick={() => integration.enablePhaseManually('safety')}
              style={{
                background: 'rgba(0,165,255,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Enable Safety
            </button>
            
            <button
              onClick={() => integration.enablePhaseManually('advanced')}
              style={{
                background: 'rgba(255,165,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Enable Advanced
            </button>
            
            <button
              onClick={() => integration.reset()}
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
              Reset
            </button>
          </div>
        </div>
      </Show>
      
      {/* Testing Tab */}
      <Show when={activeTab() === 'testing'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Testing Controls</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Test Suite Status: Ready</div>
            <div>Last Run: Never</div>
            <div>Coverage: 0%</div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <button
              onClick={() => console.log('Running integration tests...')}
              style={{
                background: 'rgba(0,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Run Tests
            </button>
            
            <button
              onClick={() => console.log('Running performance tests...')}
              style={{
                background: 'rgba(0,165,255,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Performance Tests
            </button>
            
            <button
              onClick={() => console.log('Running regression tests...')}
              style={{
                background: 'rgba(255,165,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Regression Tests
            </button>
          </div>
        </div>
      </Show>
      
      {/* Monitoring Tab */}
      <Show when={activeTab() === 'monitoring'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Performance Monitoring</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>System Health: {performance.systems().get('core')?.healthy ? '✅' : '❌'}</div>
            <div>Active Alerts: {performance.alerts().length}</div>
            <div>Memory Usage: {performance.metrics()?.core.memoryUsage || 0}MB</div>
            <div>FPS: {performance.metrics()?.core.fps || 0}</div>
            <div>Latency: {performance.metrics()?.core.latency || 0}ms</div>
          </div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Recent Alerts:</div>
            <For each={performance.alerts().slice(0, 3)}>
              {(alert) => (
                <div style={{
                  background: alert.severity === 'critical' ? 'rgba(255,0,0,0.3)' : 
                             alert.severity === 'high' ? 'rgba(255,165,0,0.3)' : 
                             'rgba(255,255,0,0.3)',
                  padding: '4px',
                  'margin-bottom': '2px',
                  'border-radius': '2px',
                  'font-size': '10px'
                }}>
                  {alert.severity}: {alert.message}
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '4px',
        'margin-bottom': '12px',
        'flex-wrap': 'wrap'
      }}>
        <button
          onClick={() => setActiveTab('flags')}
          style={{
            background: activeTab() === 'flags' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Flags
        </button>
        
        <button
          onClick={() => setActiveTab('integration')}
          style={{
            background: activeTab() === 'integration' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Integration
        </button>
        
        <button
          onClick={() => setActiveTab('testing')}
          style={{
            background: activeTab() === 'testing' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Testing
        </button>
        
        <button
          onClick={() => setActiveTab('monitoring')}
          style={{
            background: activeTab() === 'monitoring' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Monitoring
        </button>
      </div>
    </div>
  )
}
