import { createSignal, createEffect, onCleanup } from "solid-js"
import { performanceManager } from "../manager"
import { featureFlagManager } from "./feature-flags"
import { integrationManager } from "./integration-manager"

// Production Safety Validator for Phase C
export class ProductionSafetyValidator {
  private safetyChecks = new Map<string, SafetyCheck>()
  private validationResults = new Map<string, ValidationResult>()
  public isMonitoring = false
  private monitoringInterval: number | undefined
  private emergencyTriggers = new Map<string, EmergencyTrigger>()
  
  constructor() {
    this.setupSafetyChecks()
    this.setupEmergencyTriggers()
  }
  
  private setupSafetyChecks() {
    // Performance budget safety checks
    this.safetyChecks.set('performance_budget', {
      name: 'Performance Budget',
      description: 'Ensures performance metrics stay within budgets',
      metrics: ['fps', 'memoryUsage', 'latency'],
      thresholds: { fps: 55, memoryUsage: 150, latency: 200 },
      severity: 'high',
      enabled: true
    })
    
    // System stability checks
    this.safetyChecks.set('system_stability', {
      name: 'System Stability',
      description: 'Monitors system health and stability',
      metrics: ['systemHealth', 'errorRate', 'crashRate'],
      thresholds: { systemHealth: 80, errorRate: 5, crashRate: 0 },
      severity: 'critical',
      enabled: true
    })
    
    // Integration safety checks
    this.safetyChecks.set('integration_safety', {
      name: 'Integration Safety',
      description: 'Validates integration phase safety',
      metrics: ['integrationProgress', 'rollbackCount', 'healthCheckFailures'],
      thresholds: { integrationProgress: 100, rollbackCount: 2, healthCheckFailures: 3 },
      severity: 'medium',
      enabled: true
    })
    
    // User experience safety checks
    this.safetyChecks.set('user_experience', {
      name: 'User Experience',
      description: 'Ensures user experience is not degraded',
      metrics: ['responseTime', 'errorRate', 'satisfactionScore'],
      thresholds: { responseTime: 300, errorRate: 2, satisfactionScore: 85 },
      severity: 'medium',
      enabled: true
    })
    
    // Resource utilization safety checks
    this.safetyChecks.set('resource_utilization', {
      name: 'Resource Utilization',
      description: 'Monitors resource usage and prevents exhaustion',
      metrics: ['cpuUsage', 'memoryUsage', 'networkUsage'],
      thresholds: { cpuUsage: 80, memoryUsage: 200, networkUsage: 100 },
      severity: 'high',
      enabled: true
    })
  }
  
  private setupEmergencyTriggers() {
    // Critical performance degradation
    this.emergencyTriggers.set('critical_performance', {
      name: 'Critical Performance Degradation',
      condition: (metrics) => metrics.fps < 30 || metrics.memoryUsage > 300,
      action: 'emergency_rollback',
      severity: 'critical',
      enabled: true
    })
    
    // System instability
    this.emergencyTriggers.set('system_instability', {
      name: 'System Instability',
      condition: (metrics) => metrics.systemHealth < 50 || metrics.errorRate > 10,
      action: 'emergency_shutdown',
      severity: 'critical',
      enabled: true
    })
    
    // Resource exhaustion
    this.emergencyTriggers.set('resource_exhaustion', {
      name: 'Resource Exhaustion',
      condition: (metrics) => metrics.memoryUsage > 400 || metrics.cpuUsage > 90,
      action: 'resource_cleanup',
      severity: 'high',
      enabled: true
    })
    
    // Integration failure
    this.emergencyTriggers.set('integration_failure', {
      name: 'Integration Failure',
      condition: (metrics) => metrics.healthCheckFailures > 5 || metrics.rollbackCount > 3,
      action: 'integration_rollback',
      severity: 'high',
      enabled: true
    })
  }
  
  async validateProductionSafety(): Promise<SafetyValidationResult> {
    console.log('🔍 Starting production safety validation...')
    
    const startTime = Date.now()
    const results: SafetyValidationResult = {
      overall: 'safe',
      checks: [],
      emergencyActions: [],
      recommendations: [],
      duration: 0
    }
    
    try {
      // Run all safety checks
      for (const [checkId, safetyCheck] of this.safetyChecks) {
        if (!safetyCheck.enabled) continue
        
        console.log(`🔍 Running safety check: ${safetyCheck.name}`)
        
        const checkResult = await this.runSafetyCheck(checkId, safetyCheck)
        results.checks.push(checkResult)
        
        if (checkResult.status === 'critical') {
          results.overall = 'critical'
        } else if (checkResult.status === 'warning' && results.overall === 'safe') {
          results.overall = 'warning'
        }
      }
      
      // Check for emergency triggers
      const emergencyActions = await this.checkEmergencyTriggers()
      results.emergencyActions = emergencyActions
      
      if (emergencyActions.length > 0) {
        results.overall = 'critical'
        console.log('🚨 Emergency triggers activated!')
      }
      
      // Generate recommendations
      results.recommendations = this.generateRecommendations(results.checks)
      
      results.duration = Date.now() - startTime
      
      console.log(`✅ Production safety validation completed in ${results.duration}ms`)
      console.log(`📊 Overall status: ${results.overall}`)
      
      return results
      
    } catch (error) {
      console.error('❌ Production safety validation failed:', error)
      results.overall = 'critical'
      results.recommendations.push('Fix validation errors and retry')
      results.duration = Date.now() - startTime
      return results
    }
  }
  
  private async runSafetyCheck(checkId: string, safetyCheck: SafetyCheck): Promise<ValidationResult> {
    const startTime = Date.now()
    const result: ValidationResult = {
      checkId,
      name: safetyCheck.name,
      status: 'safe',
      metrics: {},
      violations: [],
      score: 100,
      duration: 0
    }
    
    try {
      // Collect metrics for this check
      const metrics = await this.collectMetricsForCheck(safetyCheck.metrics)
      result.metrics = metrics
      
      // Evaluate each metric against thresholds
      let totalScore = 100
      const violations: string[] = []
      
      for (const metric of safetyCheck.metrics) {
        const value = metrics[metric]
        const threshold = safetyCheck.thresholds[metric]
        
        if (value === undefined) {
          violations.push(`Metric ${metric} not available`)
          totalScore -= 25
          continue
        }
        
        const passed = this.evaluateMetric(metric, value, threshold)
        
        if (!passed) {
          violations.push(`${metric}: ${value} (threshold: ${threshold})`)
          totalScore -= 25
        }
      }
      
      result.violations = violations
      result.score = Math.max(0, totalScore)
      
      // Determine status based on score and severity
      if (result.score < 50) {
        result.status = 'critical'
      } else if (result.score < 75) {
        result.status = safetyCheck.severity === 'critical' ? 'critical' : 'warning'
      } else if (result.score < 90) {
        result.status = 'warning'
      }
      
      result.duration = Date.now() - startTime
      
      // Store result
      this.validationResults.set(checkId, result)
      
      console.log(`${result.status === 'safe' ? '✅' : result.status === 'warning' ? '⚠️' : '🚨'} ${safetyCheck.name}: ${result.score}/100`)
      
      return result
      
    } catch (error) {
      console.error(`❌ Safety check failed for ${safetyCheck.name}:`, error)
      result.status = 'critical'
      result.violations.push(`Check error: ${error}`)
      result.score = 0
      result.duration = Date.now() - startTime
      return result
    }
  }
  
  private async collectMetricsForCheck(metrics: string[]): Promise<Record<string, number>> {
    const performanceMetrics = performanceManager.getMetrics()
    const integrationStatus = integrationManager.getIntegrationStatus()
    
    const collected: Record<string, number> = {}
    
    for (const metric of metrics) {
      switch (metric) {
        case 'fps':
        case 'memoryUsage':
        case 'latency':
          collected[metric] = performanceMetrics?.core[metric as keyof typeof performanceMetrics.core] || 0
          break
          
        case 'systemHealth':
        case 'errorRate':
        case 'violations':
        case 'emergencyTriggers':
          collected[metric] = performanceMetrics?.safety[metric as keyof typeof performanceMetrics.safety] || 0
          break
          
        case 'integrationProgress':
          collected[metric] = integrationStatus.progress * 100
          break
          
        case 'rollbackCount':
          collected[metric] = 0 // TODO: Track rollback count
          break
          
        case 'healthCheckFailures':
          collected[metric] = 0 // TODO: Track health check failures
          break
          
        case 'responseTime':
          collected[metric] = performanceMetrics?.core.latency || 0
          break
          
        case 'satisfactionScore':
          collected[metric] = 85 // TODO: Track user satisfaction
          break
          
        case 'crashRate':
          collected[metric] = 0 // TODO: Track crash rate
          break
          
        case 'cpuUsage':
          collected[metric] = 15 // TODO: Track CPU usage
          break
          
        case 'networkUsage':
          collected[metric] = 10 // TODO: Track network usage
          break
          
        default:
          console.warn(`Unknown metric: ${metric}`)
          collected[metric] = 0
      }
    }
    
    return collected
  }
  
  private evaluateMetric(metric: string, value: number, threshold: number): boolean {
    switch (metric) {
      case 'fps':
      case 'systemHealth':
      case 'integrationProgress':
      case 'satisfactionScore':
        return value >= threshold
        
      case 'memoryUsage':
      case 'latency':
      case 'errorRate':
      case 'violations':
      case 'emergencyTriggers':
      case 'rollbackCount':
      case 'healthCheckFailures':
      case 'responseTime':
      case 'crashRate':
      case 'cpuUsage':
      case 'networkUsage':
        return value <= threshold
        
      default:
        return true // Unknown metric, assume passed
    }
  }
  
  private async checkEmergencyTriggers(): Promise<EmergencyAction[]> {
    const actions: EmergencyAction[] = []
    const metrics = await this.collectMetricsForCheck(['fps', 'memoryUsage', 'systemHealth', 'errorRate', 'healthCheckFailures', 'rollbackCount', 'cpuUsage'])
    
    for (const [triggerId, trigger] of this.emergencyTriggers) {
      if (!trigger.enabled) continue
      
      try {
        const triggered = trigger.condition(metrics)
        
        if (triggered) {
          const action = await this.executeEmergencyAction(trigger.action, triggerId)
          actions.push(action)
          
          console.log(`🚨 Emergency trigger activated: ${trigger.name} -> ${trigger.action}`)
        }
      } catch (error) {
        console.error(`❌ Emergency trigger failed: ${trigger.name}`, error)
      }
    }
    
    return actions
  }
  
  private async executeEmergencyAction(action: string, triggerId: string): Promise<EmergencyAction> {
    const emergencyAction: EmergencyAction = {
      triggerId,
      action,
      timestamp: Date.now(),
      success: false,
      message: ''
    }
    
    try {
      switch (action) {
        case 'emergency_rollback':
          await this.performEmergencyRollback()
          emergencyAction.success = true
          emergencyAction.message = 'Emergency rollback completed'
          break
          
        case 'emergency_shutdown':
          await this.performEmergencyShutdown()
          emergencyAction.success = true
          emergencyAction.message = 'Emergency shutdown completed'
          break
          
        case 'resource_cleanup':
          await this.performResourceCleanup()
          emergencyAction.success = true
          emergencyAction.message = 'Resource cleanup completed'
          break
          
        case 'integration_rollback':
          await this.performIntegrationRollback()
          emergencyAction.success = true
          emergencyAction.message = 'Integration rollback completed'
          break
          
        default:
          emergencyAction.success = false
          emergencyAction.message = `Unknown emergency action: ${action}`
      }
    } catch (error) {
      emergencyAction.success = false
      emergencyAction.message = `Emergency action failed: ${error}`
      console.error(`❌ Emergency action failed: ${action}`, error)
    }
    
    return emergencyAction
  }
  
  private async performEmergencyRollback(): Promise<void> {
    console.log('🔄 Performing emergency rollback...')
    
    // Disable all integration phases
    featureFlagManager.disablePhase('core')
    featureFlagManager.disablePhase('safety')
    featureFlagManager.disablePhase('advanced')
    
    // Reset integration manager
    integrationManager.reset()
    
    console.log('✅ Emergency rollback completed')
  }
  
  private async performEmergencyShutdown(): Promise<void> {
    console.log('🛑 Performing emergency shutdown...')
    
    // Disable all performance systems
    performanceManager.disableSystem('core')
    performanceManager.disableSystem('safety')
    performanceManager.disableSystem('advanced')
    
    // Disable all feature flags
    featureFlagManager.reset()
    
    // Reset integration manager
    integrationManager.reset()
    
    console.log('✅ Emergency shutdown completed')
  }
  
  private async performResourceCleanup(): Promise<void> {
    console.log('🧹 Performing resource cleanup...')
    
    // Clear performance store
    const store = await import('./store')
    store.performanceStore.cleanup()
    
    // Clear performance manager metrics
    performanceManager.cleanup()
    
    console.log('✅ Resource cleanup completed')
  }
  
  private async performIntegrationRollback(): Promise<void> {
    console.log('🔄 Performing integration rollback...')
    
    // Get current integration status
    const status = integrationManager.getIntegrationStatus()
    
    // Rollback phases in reverse order
    if (status.phases.advanced) {
      featureFlagManager.disableIntegrationPhase('advanced')
      console.log('🔄 Rolled back advanced phase')
    }
    
    if (status.phases.safety) {
      featureFlagManager.disableIntegrationPhase('safety')
      console.log('🔄 Rolled back safety phase')
    }
    
    if (status.phases.core) {
      featureFlagManager.disableIntegrationPhase('core')
      console.log('🔄 Rolled back core phase')
    }
    
    // Reset integration manager
    integrationManager.reset()
    
    console.log('✅ Integration rollback completed')
  }
  
  private generateRecommendations(checks: ValidationResult[]): string[] {
    const recommendations: string[] = []
    
    checks.forEach(check => {
      if (check.status === 'critical') {
        recommendations.push(`URGENT: Fix ${check.name} - ${check.violations.join(', ')}`)
      } else if (check.status === 'warning') {
        recommendations.push(`Review ${check.name} - ${check.violations.join(', ')}`)
      }
    })
    
    // Add general recommendations
    const criticalChecks = checks.filter(c => c.status === 'critical').length
    const warningChecks = checks.filter(c => c.status === 'warning').length
    
    if (criticalChecks > 0) {
      recommendations.push('Consider emergency rollback due to critical issues')
    }
    
    if (warningChecks > 2) {
      recommendations.push('Monitor system closely due to multiple warnings')
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System is operating safely - continue monitoring')
    }
    
    return recommendations
  }
  
  // Public API
  startContinuousMonitoring(): void {
    if (this.isMonitoring) return
    
    this.isMonitoring = true
    if (typeof window !== 'undefined') {
      this.monitoringInterval = window.setInterval(async () => {
        try {
          const result = await this.validateProductionSafety()
          
          // Log if not safe
          if (result.overall !== 'safe') {
            console.warn(`⚠️ Production safety validation: ${result.overall}`)
            result.recommendations.forEach(rec => console.warn(`  - ${rec}`))
          }
        } catch (error) {
          console.error('❌ Continuous monitoring error:', error)
        }
      }, 30000) // Check every 30 seconds
    }
    
    console.log('🔍 Started continuous production safety monitoring')
  }
  
  stopContinuousMonitoring(): void {
    if (!this.isMonitoring) return
    
    this.isMonitoring = false
    if (this.monitoringInterval && typeof window !== 'undefined') {
      window.clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }
    
    console.log('⏹️ Stopped continuous production safety monitoring')
  }
  
  getValidationResults(): Map<string, ValidationResult> {
    return new Map(this.validationResults)
  }
  
  getSafetyChecks(): Map<string, SafetyCheck> {
    return new Map(this.safetyChecks)
  }
  
  updateSafetyCheck(checkId: string, updates: Partial<SafetyCheck>): void {
    const check = this.safetyChecks.get(checkId)
    if (check) {
      Object.assign(check, updates)
    }
  }
  
  getEmergencyTriggers(): Map<string, EmergencyTrigger> {
    return new Map(this.emergencyTriggers)
  }
  
  updateEmergencyTrigger(triggerId: string, updates: Partial<EmergencyTrigger>): void {
    const trigger = this.emergencyTriggers.get(triggerId)
    if (trigger) {
      Object.assign(trigger, updates)
    }
  }
  
  cleanup(): void {
    this.stopContinuousMonitoring()
    this.validationResults.clear()
    this.safetyChecks.clear()
    this.emergencyTriggers.clear()
  }
}

// Interfaces
interface SafetyCheck {
  name: string
  description: string
  metrics: string[]
  thresholds: Record<string, number>
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
}

interface ValidationResult {
  checkId: string
  name: string
  status: 'safe' | 'warning' | 'critical'
  metrics: Record<string, number>
  violations: string[]
  score: number
  duration: number
}

interface SafetyValidationResult {
  overall: 'safe' | 'warning' | 'critical'
  checks: ValidationResult[]
  emergencyActions: EmergencyAction[]
  recommendations: string[]
  duration: number
}

interface EmergencyTrigger {
  name: string
  condition: (metrics: Record<string, number>) => boolean
  action: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
}

interface EmergencyAction {
  triggerId: string
  action: string
  timestamp: number
  success: boolean
  message: string
}

// Global production safety validator instance
export const productionSafetyValidator = new ProductionSafetyValidator()

// Reactive hook for production safety validation
export function useProductionSafetyValidator() {
  const [isMonitoring, setIsMonitoring] = createSignal(productionSafetyValidator.isMonitoring)
  const [lastValidation, setLastValidation] = createSignal<SafetyValidationResult | null>(null)
  const [validationResults, setValidationResults] = createSignal<Map<string, ValidationResult>>(productionSafetyValidator.getValidationResults())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setIsMonitoring(productionSafetyValidator.isMonitoring)
      setValidationResults(productionSafetyValidator.getValidationResults())
    }, 1000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    isMonitoring,
    lastValidation,
    validationResults,
    validateProductionSafety: () => productionSafetyValidator.validateProductionSafety(),
    startContinuousMonitoring: () => productionSafetyValidator.startContinuousMonitoring(),
    stopContinuousMonitoring: () => productionSafetyValidator.stopContinuousMonitoring(),
    getSafetyChecks: () => productionSafetyValidator.getSafetyChecks(),
    getEmergencyTriggers: () => productionSafetyValidator.getEmergencyTriggers()
  }
}
