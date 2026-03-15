import { createSignal, createEffect, Show, For } from "solid-js"
import { useProductionSafetyValidator } from "../shared/production-safety-validator"
import { usePerformanceImpactAssessor } from "../shared/performance-impact-assessor"
import { useFeatureFlags } from "../shared/feature-flags"
import { useIntegrationManager } from "../shared/integration-manager"
import { usePerformanceManager } from "../manager"
import { performanceManager } from "../manager"
import { performanceStore } from "../shared/store"

// Phase C Safety & Validation Dashboard
export function PhaseCSafetyDashboard() {
  const safetyValidator = useProductionSafetyValidator()
  const impactAssessor = usePerformanceImpactAssessor()
  const featureFlags = useFeatureFlags()
  const integration = useIntegrationManager()
  const performance = usePerformanceManager()
  
  const [activeTab, setActiveTab] = createSignal<'safety' | 'impact' | 'monitoring' | 'emergency'>('safety')
  const [isRunningValidation, setIsRunningValidation] = createSignal(false)
  const [isRunningAssessment, setIsRunningAssessment] = createSignal(false)
  
  return (
    <div class="phase-c-safety-dashboard" style={{
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
      'max-width': '650px',
      'max-height': '85vh',
      'overflow-y': 'auto'
    }}>
      {/* Header */}
      <div style={{
        'font-weight': 'bold',
        'margin-bottom': '12px',
        'font-size': '14px',
        'text-align': 'center'
      }}>
        🛡️ Phase C Safety & Validation Dashboard
      </div>
      
      {/* Safety Status Overview */}
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        padding: '12px',
        'border-radius': '4px',
        'margin-bottom': '12px'
      }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Safety Status</div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Safety Monitoring: {safetyValidator.isMonitoring() ? '🟢 Active' : '🔴 Inactive'}
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Impact Assessment: {impactAssessor.isAssessing() ? '🟡 Running' : '🟢 Idle'}
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          Integration Progress: {(featureFlags.getProgress() * 100).toFixed(1)}%
        </div>
        
        <div style={{ 'margin-bottom': '4px' }}>
          System Health: {performance.systems().get('core')?.healthy ? '✅' : '❌'}
        </div>
      </div>
      
      {/* Safety Validation Tab */}
      <Show when={activeTab() === 'safety'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Safety Validation</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Validation Status: Ready</div>
            <div>Last Validation: Never</div>
            <div>Emergency Actions: 0</div>
            <div>Active Alerts: {performance.alerts().length}</div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <button
              onClick={async () => {
                setIsRunningValidation(true)
                try {
                  const result = await safetyValidator.validateProductionSafety()
                  console.log('Safety validation result:', result)
                } catch (error) {
                  console.error('Safety validation failed:', error)
                } finally {
                  setIsRunningValidation(false)
                }
              }}
              disabled={isRunningValidation()}
              style={{
                background: isRunningValidation() ? 'rgba(128,128,128,0.5)' : 'rgba(0,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: isRunningValidation() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              {isRunningValidation() ? 'Validating...' : 'Run Validation'}
            </button>
            
            <button
              onClick={() => safetyValidator.startContinuousMonitoring()}
              disabled={safetyValidator.isMonitoring()}
              style={{
                background: safetyValidator.isMonitoring() ? 'rgba(128,128,128,0.5)' : 'rgba(0,165,255,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: safetyValidator.isMonitoring() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              Start Monitoring
            </button>
            
            <button
              onClick={() => safetyValidator.stopContinuousMonitoring()}
              disabled={!safetyValidator.isMonitoring()}
              style={{
                background: !safetyValidator.isMonitoring() ? 'rgba(128,128,128,0.5)' : 'rgba(255,0,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: !safetyValidator.isMonitoring() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              Stop Monitoring
            </button>
          </div>
          
          {/* Safety Checks Status */}
          <div style={{ 'margin-top': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Safety Checks:</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <div>📊 Performance Budget: ✅ Active</div>
              <div>🛡️ System Stability: ✅ Active</div>
              <div>🔄 Integration Safety: ✅ Active</div>
              <div>👤 User Experience: ✅ Active</div>
              <div>💾 Resource Utilization: ✅ Active</div>
            </div>
          </div>
        </div>
      </Show>
      
      {/* Impact Assessment Tab */}
      <Show when={activeTab() === 'impact'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Performance Impact Assessment</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Baseline Status: ✅ Captured</div>
            <div>Assessment History: 0 results</div>
            <div>Current Impact: None</div>
            <div>Confidence Level: N/A</div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <button
              onClick={async () => {
                setIsRunningAssessment(true)
                try {
                  const result = await impactAssessor.assessPerformanceImpact('core')
                  console.log('Core impact assessment:', result)
                } catch (error) {
                  console.error('Core impact assessment failed:', error)
                } finally {
                  setIsRunningAssessment(false)
                }
              }}
              disabled={isRunningAssessment()}
              style={{
                background: isRunningAssessment() ? 'rgba(128,128,128,0.5)' : 'rgba(0,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: isRunningAssessment() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              {isRunningAssessment() ? 'Assessing...' : 'Assess Core'}
            </button>
            
            <button
              onClick={async () => {
                setIsRunningAssessment(true)
                try {
                  const result = await impactAssessor.assessPerformanceImpact('safety')
                  console.log('Safety impact assessment:', result)
                } catch (error) {
                  console.error('Safety impact assessment failed:', error)
                } finally {
                  setIsRunningAssessment(false)
                }
              }}
              disabled={isRunningAssessment()}
              style={{
                background: isRunningAssessment() ? 'rgba(128,128,128,0.5)' : 'rgba(0,165,255,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: isRunningAssessment() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              {isRunningAssessment() ? 'Assessing...' : 'Assess Safety'}
            </button>
            
            <button
              onClick={async () => {
                setIsRunningAssessment(true)
                try {
                  const result = await impactAssessor.assessPerformanceImpact('advanced')
                  console.log('Advanced impact assessment:', result)
                } catch (error) {
                  console.error('Advanced impact assessment failed:', error)
                } finally {
                  setIsRunningAssessment(false)
                }
              }}
              disabled={isRunningAssessment()}
              style={{
                background: isRunningAssessment() ? 'rgba(128,128,128,0.5)' : 'rgba(255,165,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: isRunningAssessment() ? 'not-allowed' : 'pointer',
                'font-size': '10px'
              }}
            >
              {isRunningAssessment() ? 'Assessing...' : 'Assess Advanced'}
            </button>
            
            <button
              onClick={() => impactAssessor.recaptureBaseline()}
              style={{
                background: 'rgba(255,255,0,0.5)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Recapture Baseline
            </button>
          </div>
          
          {/* Baseline Metrics */}
          <div style={{ 'margin-top': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Baseline Metrics:</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <div>🎯 FPS: {performance.metrics()?.core.fps || 0}</div>
              <div>💾 Memory: {performance.metrics()?.core.memoryUsage || 0}MB</div>
              <div>⏱️ Latency: {performance.metrics()?.core.latency || 0}ms</div>
              <div>🎨 Render: {performance.metrics()?.core.renderTime || 0}ms</div>
            </div>
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
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Continuous Monitoring</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Safety Monitor: {safetyValidator.isMonitoring() ? '🟢 Running' : '🔴 Stopped'}</div>
            <div>Impact Monitor: {impactAssessor.isAssessing() ? '🟡 Running' : '🟢 Idle'}</div>
            <div>Monitor Interval: 30s (Safety) / 60s (Impact)</div>
            <div>Alert Threshold: Warning {'>'} 25%, Critical {'>'} 50%</div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <button
              onClick={() => {
                safetyValidator.startContinuousMonitoring()
                impactAssessor.startContinuousMonitoring()
              }}
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
              Start All Monitoring
            </button>
            
            <button
              onClick={() => {
                safetyValidator.stopContinuousMonitoring()
                impactAssessor.stopContinuousMonitoring()
              }}
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
              Stop All Monitoring
            </button>
          </div>
          
          {/* Recent Alerts */}
          <div style={{ 'margin-top': '8px' }}>
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
                  {alert.severity.toUpperCase()}: {alert.message}
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      
      {/* Emergency Procedures Tab */}
      <Show when={activeTab() === 'emergency'}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          'border-radius': '4px',
          'margin-bottom': '12px'
        }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>Emergency Procedures</div>
          
          <div style={{ 'margin-bottom': '8px' }}>
            <div>Emergency Status: Normal</div>
            <div>Last Emergency: Never</div>
            <div>Rollback Count: 0</div>
            <div>Emergency Actions: 0</div>
          </div>
          
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <button
              onClick={() => {
                console.log('🚨 Emergency rollback triggered')
                integration.reset()
                featureFlags.reset()
              }}
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
              Emergency Rollback
            </button>
            
            <button
              onClick={() => {
                console.log('🛑 Emergency shutdown triggered')
                performanceManager.disableSystem('core')
                performanceManager.disableSystem('safety')
                performanceManager.disableSystem('advanced')
                featureFlags.reset()
              }}
              style={{
                background: 'rgba(255,0,0,0.7)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '10px'
              }}
            >
              Emergency Shutdown
            </button>
            
            <button
              onClick={() => {
                console.log('🧹 Resource cleanup triggered')
                const store = performanceStore
                store.cleanup()
              }}
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
              Resource Cleanup
            </button>
          </div>
          
          {/* Emergency Triggers */}
          <div style={{ 'margin-top': '8px' }}>
            <div style={{ 'font-weight': 'bold', 'margin-bottom': '4px' }}>Emergency Triggers:</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <div>🚨 Critical Performance: FPS {'<'} 30 OR Memory {'>'} 300MB</div>
              <div>🛑 System Instability: Health {'<'} 50% OR Errors {'>'} 10%</div>
              <div>💾 Resource Exhaustion: Memory {'>'} 400MB OR CPU {'>'} 90%</div>
              <div>🔄 Integration Failure: Health Checks {'>'} 5 OR Rollbacks {'>'} 3</div>
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
          onClick={() => setActiveTab('safety')}
          style={{
            background: activeTab() === 'safety' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Safety
        </button>
        
        <button
          onClick={() => setActiveTab('impact')}
          style={{
            background: activeTab() === 'impact' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            'border-radius': '4px',
            cursor: 'pointer',
            'font-size': '10px'
          }}
        >
          Impact
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
    </div>
  )
}
