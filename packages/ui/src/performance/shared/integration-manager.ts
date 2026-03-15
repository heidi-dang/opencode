import { createSignal, createEffect, onCleanup } from "solid-js"
import { performanceManager } from "../manager"
import { featureFlagManager } from "./feature-flags"

// Integration Manager for gradual rollout and testing
export class IntegrationManager {
  private integrationPhases = ['core', 'safety', 'advanced'] as const
  private currentPhase = 0
  public isIntegrating = false
  private integrationStartTime = 0
  private healthChecks = new Map<string, HealthCheck>()
  
  constructor() {
    this.setupHealthChecks()
  }
  
  private setupHealthChecks() {
    // Core phase health checks
    this.healthChecks.set('core', {
      metrics: ['fps', 'memoryUsage', 'latency'],
      thresholds: { fps: 55, memoryUsage: 100, latency: 100 },
      duration: 300000, // 5 minutes
      requiredPasses: 3
    })
    
    // Safety phase health checks
    this.healthChecks.set('safety', {
      metrics: ['violations', 'emergencyTriggers', 'systemHealth'],
      thresholds: { violations: 2, emergencyTriggers: 0, systemHealth: 80 },
      duration: 600000, // 10 minutes
      requiredPasses: 5
    })
    
    // Advanced phase health checks
    this.healthChecks.set('advanced', {
      metrics: ['predictionAccuracy', 'mlOptimizations', 'realTimeAlerts'],
      thresholds: { predictionAccuracy: 0.7, mlOptimizations: 15, realTimeAlerts: 3 },
      duration: 900000, // 15 minutes
      requiredPasses: 7
    })
  }
  
  async startIntegration(): Promise<IntegrationResult> {
    if (this.isIntegrating) {
      throw new Error('Integration already in progress')
    }
    
    this.isIntegrating = true
    this.integrationStartTime = Date.now()
    
    try {
      const results: IntegrationResult = {
        phase: 'core',
        success: false,
        duration: 0,
        healthChecks: [],
        errors: [],
        recommendations: []
      }
      
      // Integrate each phase sequentially
      for (let i = 0; i < this.integrationPhases.length; i++) {
        const phase = this.integrationPhases[i]
        results.phase = phase
        
        console.log(`🚀 Starting integration for phase: ${phase}`)
        
        try {
          const phaseResult = await this.integratePhase(phase)
          results.healthChecks.push(phaseResult)
          
          if (!phaseResult.success) {
            results.errors.push(`Phase ${phase} failed health checks`)
            results.recommendations.push(`Fix ${phase} issues before proceeding`)
            break
          }
          
          console.log(`✅ Phase ${phase} integration successful`)
          
          // Wait before proceeding to next phase
          if (i < this.integrationPhases.length - 1) {
            await this.wait(60000) // 1 minute between phases
          }
          
        } catch (error) {
          results.errors.push(`Phase ${phase} integration error: ${error}`)
          results.recommendations.push(`Review ${phase} configuration and retry`)
          break
        }
      }
      
      results.success = results.errors.length === 0
      results.duration = Date.now() - this.integrationStartTime
      
      return results
      
    } finally {
      this.isIntegrating = false
    }
  }
  
  private async integratePhase(phase: 'core' | 'safety' | 'advanced'): Promise<HealthCheckResult> {
    // Enable the phase
    featureFlagManager.enableIntegrationPhase(phase)
    
    // Wait for systems to initialize
    await this.wait(5000)
    
    // Run health checks
    const healthCheck = this.healthChecks.get(phase)!
    const results: HealthCheckResult = {
      phase,
      success: false,
      duration: 0,
      metrics: {},
      passes: 0,
      failures: 0,
      thresholdViolations: []
    }
    
    const startTime = Date.now()
    const endTime = startTime + healthCheck.duration
    let passCount = 0
    
    while (Date.now() < endTime && passCount < healthCheck.requiredPasses) {
      try {
        const metrics = this.collectPhaseMetrics(phase)
        results.metrics = metrics
        
        const passed = this.evaluateHealthCheck(phase, metrics, healthCheck.thresholds)
        
        if (passed) {
          passCount++
          results.passes = passCount
          console.log(`✅ Phase ${phase} health check passed (${passCount}/${healthCheck.requiredPasses})`)
        } else {
          results.failures++
          console.log(`❌ Phase ${phase} health check failed`)
        }
        
        // Wait between checks
        await this.wait(10000)
        
      } catch (error) {
        results.errors = results.errors || []
        results.errors.push(`Health check error: ${error}`)
        console.error(`❌ Phase ${phase} health check error: ${error}`)
      }
    }
    
    results.duration = Date.now() - startTime
    results.success = passCount >= healthCheck.requiredPasses
    
    if (!results.success) {
      // Rollback the phase if it failed
      featureFlagManager.disableIntegrationPhase(phase)
      console.log(`🔄 Phase ${phase} rolled back due to failed health checks`)
    }
    
    return results
  }
  
  private collectPhaseMetrics(phase: 'core' | 'safety' | 'advanced'): Record<string, number> {
    const metrics = performanceManager.getMetrics()
    if (!metrics) {
      throw new Error('No metrics available')
    }
    
    const phaseMetrics: Record<string, number> = {}
    
    switch (phase) {
      case 'core':
        phaseMetrics.fps = metrics.core.fps
        phaseMetrics.memoryUsage = metrics.core.memoryUsage
        phaseMetrics.latency = metrics.core.latency
        break
        
      case 'safety':
        phaseMetrics.violations = metrics.safety.violations
        phaseMetrics.emergencyTriggers = metrics.safety.emergencyTriggers
        phaseMetrics.systemHealth = metrics.safety.systemHealth
        break
        
      case 'advanced':
        phaseMetrics.predictionAccuracy = metrics.advanced.predictionAccuracy
        phaseMetrics.mlOptimizations = metrics.advanced.mlOptimizations
        phaseMetrics.realTimeAlerts = metrics.advanced.realTimeAlerts
        break
    }
    
    return phaseMetrics
  }
  
  private evaluateHealthCheck(phase: string, metrics: Record<string, number>, thresholds: Record<string, number>): boolean {
    const healthCheck = this.healthChecks.get(phase)!
    
    for (const metric of healthCheck.metrics) {
      const value = metrics[metric]
      const threshold = thresholds[metric]
      
      if (value === undefined) {
        console.warn(`⚠️ Metric ${metric} not available for phase ${phase}`)
        return false
      }
      
      // Different evaluation based on metric type
      let passed = false
      
      switch (metric) {
        case 'fps':
        case 'systemHealth':
        case 'predictionAccuracy':
          passed = value >= threshold
          break
          
        case 'memoryUsage':
        case 'latency':
        case 'violations':
        case 'emergencyTriggers':
        case 'mlOptimizations':
        case 'realTimeAlerts':
          passed = value <= threshold
          break
          
        default:
          passed = true // Unknown metric, assume passed
      }
      
      if (!passed) {
        console.warn(`⚠️ Phase ${phase} metric ${metric} failed: ${value} (threshold: ${threshold})`)
        return false
      }
    }
    
    return true
  }
  
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  // Manual phase management
  async enablePhaseManually(phase: 'core' | 'safety' | 'advanced'): Promise<boolean> {
    try {
      featureFlagManager.enableIntegrationPhase(phase)
      
      // Wait for initialization
      await this.wait(5000)
      
      // Quick health check
      const metrics = this.collectPhaseMetrics(phase)
      const healthCheck = this.healthChecks.get(phase)!
      const passed = this.evaluateHealthCheck(phase, metrics, healthCheck.thresholds)
      
      if (!passed) {
        featureFlagManager.disableIntegrationPhase(phase)
        return false
      }
      
      return true
      
    } catch (error) {
      console.error(`❌ Manual phase enable failed for ${phase}:`, error)
      featureFlagManager.disableIntegrationPhase(phase)
      return false
    }
  }
  
  disablePhaseManually(phase: 'core' | 'safety' | 'advanced'): void {
    featureFlagManager.disableIntegrationPhase(phase)
    console.log(`🔴 Phase ${phase} manually disabled`)
  }
  
  getIntegrationStatus(): IntegrationStatus {
    const status = featureFlagManager.getIntegrationStatus()
    const isIntegrating = this.isIntegrating
    const currentPhase = this.integrationPhases[this.currentPhase]
    
    return {
      currentPhase,
      isIntegrating,
      progress: status.overall,
      phases: {
        core: status.core,
        safety: status.safety,
        advanced: status.advanced
      },
      healthChecks: Array.from(this.healthChecks.keys()),
      integrationStartTime: this.integrationStartTime
    }
  }
  
  reset(): void {
    this.currentPhase = 0
    this.isIntegrating = false
    this.integrationStartTime = 0
    
    // Disable all phases
    this.integrationPhases.forEach(phase => {
      featureFlagManager.disableIntegrationPhase(phase)
    })
    
    console.log('🔄 Integration manager reset')
  }
}

// Interfaces
interface HealthCheck {
  metrics: string[]
  thresholds: Record<string, number>
  duration: number
  requiredPasses: number
}

interface HealthCheckResult {
  phase: string
  success: boolean
  duration: number
  metrics: Record<string, number>
  passes: number
  failures: number
  thresholdViolations: string[]
  errors?: string[]
}

interface IntegrationResult {
  phase: string
  success: boolean
  duration: number
  healthChecks: HealthCheckResult[]
  errors: string[]
  recommendations: string[]
}

interface IntegrationStatus {
  currentPhase: string
  isIntegrating: boolean
  progress: number
  phases: {
    core: boolean
    safety: boolean
    advanced: boolean
  }
  healthChecks: string[]
  integrationStartTime: number
}

// Global integration manager instance
export const integrationManager = new IntegrationManager()

// Reactive hook for integration management
export function useIntegrationManager() {
  const [status, setStatus] = createSignal<IntegrationStatus>(integrationManager.getIntegrationStatus())
  const [isIntegrating, setIsIntegrating] = createSignal(integrationManager.isIntegrating)
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStatus(integrationManager.getIntegrationStatus())
      setIsIntegrating(integrationManager.isIntegrating)
    }, 1000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    status,
    isIntegrating,
    startIntegration: () => integrationManager.startIntegration(),
    enablePhaseManually: (phase: 'core' | 'safety' | 'advanced') => integrationManager.enablePhaseManually(phase),
    disablePhaseManually: (phase: 'core' | 'safety' | 'advanced') => integrationManager.disablePhaseManually(phase),
    reset: () => integrationManager.reset()
  }
}
