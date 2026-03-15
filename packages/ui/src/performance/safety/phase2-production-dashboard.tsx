import { createSignal, createEffect, Show, For } from "solid-js"
import { useAdvancedRollout } from "./advanced-rollout-system"
import { useProductionAnalytics } from "./production-analytics"
import { useBudgetEnforcer } from "./budget-enforcer"
import { useEmergencySystem } from "./emergency-systems"

// Phase 2 Production Dashboard Component
export function Phase2ProductionDashboard() {
  const rollout = useAdvancedRollout()
  const analytics = useProductionAnalytics()
  const budget = useBudgetEnforcer()
  const emergency = useEmergencySystem()
  
  const [isExpanded, setIsExpanded] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<'overview' | 'rollout' | 'analytics' | 'budgets' | 'emergency'>('overview')
  
  return (
    <div class="phase2-production-dashboard" style={{
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
      'max-width': '500px',
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
        🚀 Phase 2 Production Dashboard
      </div>
      
      {/* System Status Overview */}
      <Show when={activeTab() === 'overview'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>System Status</div>
          
          {/* Rollout Status */}
          <div style={{ 'margin-bottom': '4px' }}>
            📊 Rollout: Phase {rollout.status().phase}/{rollout.status().totalPhases} ({rollout.status().progress.toFixed(1)}%)
          </div>
          
          {/* System Health */}
          <div style={{ 'margin-bottom': '4px' }}>
            💚 Health: {analytics.systemHealth().score}/100 ({analytics.systemHealth().status})
          </div>
          
          {/* Budget Status */}
          <div style={{ 'margin-bottom': '4px' }}>
            💰 Budgets: {budget.status().violations} violations
          </div>
          
          {/* Emergency Status */}
          <div style={{ 'margin-bottom': '4px' }}>
            🚨 Emergency: {emergency.status().emergencyMode ? 'ACTIVE' : 'Normal'}
          </div>
        </div>
      </Show>
      
      {/* Rollout Management */}
      <Show when={activeTab() === 'rollout'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Rollout Management</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Current Phase: {rollout.status().phaseName}</div>
            <div>Progress: {rollout.status().progress.toFixed(1)}%</div>
            <div>Rollout: {rollout.status().rolloutPercentage}%</div>
            <div>Health: {rollout.status().healthy ? '✅ Healthy' : '⚠️ Issues'}</div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '8px' }}>
            <button
              onClick={() => rollout.advancePhase()}
              disabled={!rollout.status().canAdvance}
              style={{
                background: rollout.status().canAdvance ? 'rgba(0,255,0,0.5)' : 'rgba(128,128,128,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: rollout.status().canAdvance ? 'pointer' : 'not-allowed',
                'font-size': '10px'
              }}
            >
              Advance Phase
            </button>
            
            <button
              onClick={() => rollout.rollbackPhase('Manual rollback')}
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
              Rollback
            </button>
          </div>
          
          <Show when={rollout.status().nextPhase}>
            <div style={{ 'font-size': '10px', opacity: 0.8 }}>
              Next Phase: {rollout.status().nextPhase}
            </div>
          </Show>
        </div>
      </Show>
      
      {/* Production Analytics */}
      <Show when={activeTab() === 'analytics'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Production Analytics</div>
          
          {/* System Health */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Health Score: {analytics.systemHealth().score}/100</div>
            <div>Status: {analytics.systemHealth().status}</div>
            <div>Active Alerts: {analytics.systemHealth().activeAlerts}</div>
            <div>Uptime: {Math.floor(analytics.systemHealth().uptime / 1000)}s</div>
          </div>
          
          {/* Active Alerts */}
          <Show when={analytics.activeAlerts().length > 0}>
            <div style={{ 'margin-bottom': '8px' }}>
              <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Active Alerts:</div>
              <For each={analytics.activeAlerts().slice(0, 5)}>
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
                    {alert.severity.toUpperCase()}: {alert.message}
                  </div>
                )}
              </For>
            </div>
          </Show>
          
          {/* User Analytics */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>User Analytics:</div>
            <div>Total Users: {analytics.userAnalytics().totalUsers}</div>
            <div>Active Users: {analytics.userAnalytics().activeUsers}</div>
            <div>Top Actions: {analytics.userAnalytics().topActions.slice(0, 3).map(a => a.action).join(', ')}</div>
          </div>
        </div>
      </Show>
      
      {/* Budget Enforcement */}
      <Show when={activeTab() === 'budgets'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Budget Enforcement</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Total Budgets: {budget.status().totalBudgets}</div>
            <div>Violations: {budget.status().violations}</div>
            <div>Critical: {budget.status().criticalViolations}</div>
            <div>Warnings: {budget.status().warningViolations}</div>
            <div>Active Enforcements: {budget.status().activeEnforcements}</div>
          </div>
          
          {/* Budget Details */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Budget Details:</div>
            <For each={budget.budgets().slice(0, 5)}>
              {(budgetItem) => (
                <div style={{
                  background: budgetItem.current > budgetItem.budget ? 'rgba(255,0,0,0.3)' : 'rgba(0,255,0,0.3)',
                  padding: '4px',
                  'margin-bottom': '2px',
                  'border-radius': '2px',
                  'font-size': '10px'
                }}>
                  {budgetItem.name}: {budgetItem.current}/{budgetItem.budget}{budgetItem.unit}
                </div>
              )}
            </For>
          </div>
          
          {/* Violations */}
          <Show when={budget.violations().length > 0}>
            <div style={{ 'margin-bottom': '8px' }}>
              <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Violations:</div>
              <For each={budget.violations().slice(0, 3)}>
                {(violation) => (
                  <div style={{
                    background: violation.level === 'critical' ? 'rgba(255,0,0,0.3)' : 'rgba(255,165,0,0.3)',
                    padding: '4px',
                    'margin-bottom': '2px',
                    'border-radius': '2px',
                    'font-size': '10px'
                  }}>
                    {violation.metric}: {violation.level} ({violation.current}/{violation.budget})
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      
      {/* Emergency Systems */}
      <Show when={activeTab() === 'emergency'}>
        <div style={{
          background: emergency.status().emergencyMode ? 'rgba(255,0,0,0.3)' : 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>
            Emergency Systems {emergency.status().emergencyMode ? '🚨 ACTIVE' : '✅ Normal'}
          </div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Emergency Mode: {emergency.status().emergencyMode ? 'ACTIVE' : 'Normal'}</div>
            <div>Active Triggers: {emergency.status().activeTriggers.length}</div>
            <div>System Health: {emergency.status().systemHealth?.score || 'N/A'}/100</div>
          </div>
          
          {/* Manual Emergency Controls */}
          <div style={{ 'margin-bottom': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Manual Controls:</div>
            <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
              <button
                onClick={() => emergency.manualEmergencyTrigger('critical_performance', 'Manual test')}
                style={{
                  background: 'rgba(255,0,0,0.5)',
                  border: 'none',
                  color: 'white',
                  padding: '4px 8px',
                  'border-radius': '4px',
                  cursor: 'pointer',
                  'font-size': '9px'
                }}
              >
                Test Critical
              </button>
              
              <button
                onClick={() => emergency.manualEmergencyTrigger('memory_exhaustion', 'Manual test')}
                style={{
                  background: 'rgba(255,165,0,0.5)',
                  border: 'none',
                  color: 'white',
                  padding: '4px 8px',
                  'border-radius': '4px',
                  cursor: 'pointer',
                  'font-size': '9px'
                }}
              >
                Test Memory
              </button>
              
              <button
                onClick={() => emergency.resolveEmergency()}
                disabled={!emergency.status().emergencyMode}
                style={{
                  background: emergency.status().emergencyMode ? 'rgba(0,255,0,0.5)' : 'rgba(128,128,128,0.5)',
                  border: 'none',
                  color: 'white',
                  padding: '4px 8px',
                  'border-radius': '4px',
                  cursor: emergency.status().emergencyMode ? 'pointer' : 'not-allowed',
                  'font-size': '9px'
                }}
              >
                Resolve
              </button>
            </div>
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
          onClick={() => setActiveTab('overview')}
          style={{
            background: activeTab() === 'overview' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Overview
        </button>
        
        <button
          onClick={() => setActiveTab('rollout')}
          style={{
            background: activeTab() === 'rollout' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Rollout
        </button>
        
        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            background: activeTab() === 'analytics' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Analytics
        </button>
        
        <button
          onClick={() => setActiveTab('budgets')}
          style={{
            background: activeTab() === 'budgets' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Budgets
        </button>
        
        <button
          onClick={() => setActiveTab('emergency')}
          style={{
            background: activeTab() === 'emergency' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Emergency
        </button>
      </div>
      
      {/* Expand/Collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded())}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          padding: '4px 8px',
          'border-radius': '4px',
          cursor: 'pointer',
          'font-size': '10px',
          width: '100%'
        }}
      >
        {isExpanded() ? 'Collapse' : 'Expand'}
      </button>
    </div>
  )
}
