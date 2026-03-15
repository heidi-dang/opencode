import { createSignal, createEffect, onCleanup } from "solid-js"
import { productionAnalytics } from "./production-analytics"
import { advancedRolloutSystem } from "./advanced-rollout-system"
import { budgetEnforcer } from "./budget-enforcer"

// Emergency Systems for Phase 2
export class EmergencySystem {
  private emergencyMode = false
  private emergencyTriggers = new Map<string, EmergencyTrigger>()
  private emergencyProcedures = new Map<string, EmergencyProcedure>()
  private systemHealth = new Map<string, HealthStatus>()
  
  constructor() {
    this.initializeEmergencyTriggers()
    this.initializeEmergencyProcedures()
    this.startHealthMonitoring()
  }
  
  private initializeEmergencyTriggers() {
    // Critical performance triggers
    this.emergencyTriggers.set('critical_performance', {
      name: 'critical_performance',
      condition: () => this.checkCriticalPerformance(),
      severity: 'critical',
      autoTrigger: true,
      cooldown: 30000 // 30 seconds
    })
    
    this.emergencyTriggers.set('memory_exhaustion', {
      name: 'memory_exhaustion',
      condition: () => this.checkMemoryExhaustion(),
      severity: 'critical',
      autoTrigger: true,
      cooldown: 60000 // 1 minute
    })
    
    this.emergencyTriggers.set('fps_collapse', {
      name: 'fps_collapse',
      condition: () => this.checkFPSCollapse(),
      severity: 'critical',
      autoTrigger: true,
      cooldown: 15000 // 15 seconds
    })
    
    this.emergencyTriggers.set('error_spike', {
      name: 'error_spike',
      condition: () => this.checkErrorSpike(),
      severity: 'high',
      autoTrigger: true,
      cooldown: 45000 // 45 seconds
    })
    
    this.emergencyTriggers.set('user_complaints', {
      name: 'user_complaints',
      condition: () => this.checkUserComplaints(),
      severity: 'medium',
      autoTrigger: false,
      cooldown: 120000 // 2 minutes
    })
  }
  
  private initializeEmergencyProcedures() {
    // Emergency procedures for different scenarios
    this.emergencyProcedures.set('full_shutdown', {
      name: 'full_shutdown',
      description: 'Complete system shutdown',
      severity: 'critical',
      actions: [
        'disable_all_performance_features',
        'rollback_to_safe_mode',
        'clear_all_caches',
        'notify_administrators'
      ],
      execute: () => this.executeFullShutdown()
    })
    
    this.emergencyProcedures.set('partial_rollback', {
      name: 'partial_rollback',
      description: 'Partial feature rollback',
      severity: 'high',
      actions: [
        'disable_advanced_features',
        'enable_basic_mode',
        'reduce_complexity',
        'monitor_recovery'
      ],
      execute: () => this.executePartialRollback()
    })
    
    this.emergencyProcedures.set('emergency_optimization', {
      name: 'emergency_optimization',
      description: 'Emergency performance optimization',
      severity: 'medium',
      actions: [
        'clear_caches',
        'reduce_quality',
        'throttle_updates',
        'enable_emergency_mode'
      ],
      execute: () => this.executeEmergencyOptimization()
    })
    
    this.emergencyProcedures.set('user_mitigation', {
      name: 'user_mitigation',
      description: 'User experience mitigation',
      severity: 'low',
      actions: [
        'show_performance_warning',
        'offer_simplified_mode',
        'provide_feedback_channel',
        'document_incident'
      ],
      execute: () => this.executeUserMitigation()
    })
  }
  
  private startHealthMonitoring() {
    // Monitor system health every 5 seconds
    setInterval(() => {
      this.updateSystemHealth()
      this.checkEmergencyTriggers()
    }, 5000)
  }
  
  private updateSystemHealth() {
    const health = productionAnalytics.getSystemHealth()
    
    this.systemHealth.set('overall', {
      status: health.status,
      score: health.score,
      lastUpdate: Date.now(),
      metrics: {
        activeAlerts: health.activeAlerts,
        criticalAlerts: health.criticalAlerts,
        uptime: health.uptime
      }
    })
    
    // Check individual component health
    this.checkComponentHealth()
  }
  
  private checkComponentHealth() {
    // Check rollout system health
    const rolloutStatus = advancedRolloutSystem.getRolloutStatus()
    this.systemHealth.set('rollout', {
      status: rolloutStatus.healthy ? 'healthy' : 'warning',
      score: rolloutStatus.healthy ? 90 : 60,
      lastUpdate: Date.now(),
      metrics: {
        phase: rolloutStatus.phase,
        progress: rolloutStatus.progress,
        activeAlerts: rolloutStatus.metrics.errorRate > 0 ? 1 : 0
      }
    })
    
    // Check budget enforcer health
    const budgetStatus = budgetEnforcer.getBudgetStatus()
    this.systemHealth.set('budgets', {
      status: budgetStatus.criticalViolations > 0 ? 'critical' : 
              budgetStatus.violations > 0 ? 'warning' : 'healthy',
      score: Math.max(0, 100 - (budgetStatus.criticalViolations * 25) - (budgetStatus.violations * 10)),
      lastUpdate: Date.now(),
      metrics: budgetStatus
    })
  }
  
  private checkEmergencyTriggers() {
    for (const [name, trigger] of this.emergencyTriggers) {
      if (trigger.autoTrigger && this.shouldCheckTrigger(trigger)) {
        if (trigger.condition()) {
          this.triggerEmergency(name, trigger)
        }
      }
    }
  }
  
  private shouldCheckTrigger(trigger: EmergencyTrigger): boolean {
    const lastTrigger = this.getLastTriggerTime(trigger.name)
    return Date.now() - lastTrigger >= trigger.cooldown
  }
  
  private getLastTriggerTime(triggerName: string): number {
    if (typeof window !== 'undefined') {
      const lastTrigger = localStorage.getItem(`emergency-trigger-${triggerName}`)
      return lastTrigger ? parseInt(lastTrigger) : 0
    }
    return 0
  }
  
  private setLastTriggerTime(triggerName: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`emergency-trigger-${triggerName}`, Date.now().toString())
    }
  }
  
  // Emergency condition checks
  private checkCriticalPerformance(): boolean {
    const health = this.systemHealth.get('overall')
    return health ? health.score < 30 : false
  }
  
  private checkMemoryExhaustion(): boolean {
    const health = this.systemHealth.get('overall')
    return health ? health.metrics.activeAlerts > 5 : false
  }
  
  private checkFPSCollapse(): boolean {
    // Check if FPS has collapsed below 20
    const metrics = productionAnalytics.getMetric('fps')
    return metrics ? metrics.value < 20 : false
  }
  
  private checkErrorSpike(): boolean {
    const health = this.systemHealth.get('overall')
    return health ? health.metrics.criticalAlerts > 2 : false
  }
  
  private checkUserComplaints(): boolean {
    // Check for user feedback indicating issues
    if (typeof window !== 'undefined') {
      const complaints = JSON.parse(localStorage.getItem('user-complaints') || '[]')
      const recentComplaints = complaints.filter((c: any) => Date.now() - c.timestamp < 300000) // Last 5 minutes
      return recentComplaints.length > 3
    }
    return false
  }
  
  private triggerEmergency(triggerName: string, trigger: EmergencyTrigger) {
    console.error(`🚨 EMERGENCY TRIGGERED: ${triggerName}`)
    
    this.setLastTriggerTime(triggerName)
    this.emergencyMode = true
    
    // Determine appropriate procedure
    const procedure = this.selectEmergencyProcedure(trigger)
    
    if (procedure) {
      this.executeEmergencyProcedure(procedure)
    }
    
    // Log emergency event
    this.logEmergencyEvent(triggerName, trigger, procedure)
  }
  
  private selectEmergencyProcedure(trigger: EmergencyTrigger): EmergencyProcedure | undefined {
    switch (trigger.severity) {
      case 'critical':
        return this.emergencyProcedures.get('full_shutdown')
      case 'high':
        return this.emergencyProcedures.get('partial_rollback')
      case 'medium':
        return this.emergencyProcedures.get('emergency_optimization')
      case 'low':
        return this.emergencyProcedures.get('user_mitigation')
      default:
        return undefined
    }
  }
  
  private executeEmergencyProcedure(procedure: EmergencyProcedure | undefined) {
    if (!procedure) return
    
    console.warn(`🚡 EXECUTING EMERGENCY PROCEDURE: ${procedure.name}`)
    
    try {
      procedure.execute()
      
      // Track procedure execution
      this.trackEmergencyProcedure(procedure)
      
    } catch (error) {
      console.error(`❌ Emergency procedure failed: ${procedure.name}`, error)
    }
  }
  
  // Emergency procedure implementations
  private executeFullShutdown() {
    console.error('🚨 EXECUTING FULL EMERGENCY SHUTDOWN')
    
    // Disable all performance features
    this.disableAllPerformanceFeatures()
    
    // Rollback to safe mode
    advancedRolloutSystem.emergencyRollback('Critical performance degradation')
    
    // Clear all caches
    this.clearAllCaches()
    
    // Notify administrators
    this.notifyAdministrators('full_shutdown')
    
    // Set emergency mode
    this.setEmergencyMode(true)
  }
  
  private executePartialRollback() {
    console.warn('⚠️ EXECUTING PARTIAL ROLLBACK')
    
    // Disable advanced features
    this.disableAdvancedFeatures()
    
    // Enable basic mode
    this.enableBasicMode()
    
    // Reduce complexity
    this.reduceComplexity()
    
    // Monitor recovery
    this.monitorRecovery()
  }
  
  private executeEmergencyOptimization() {
    console.warn('🔧 EXECUTING EMERGENCY OPTIMIZATION')
    
    // Clear caches
    this.clearAllCaches()
    
    // Reduce quality
    this.reduceQuality()
    
    // Throttle updates
    this.throttleUpdates()
    
    // Enable emergency mode
    this.setEmergencyMode(true)
  }
  
  private executeUserMitigation() {
    console.info('👥 EXECUTING USER MITIGATION')
    
    // Show performance warning
    this.showPerformanceWarning()
    
    // Offer simplified mode
    this.offerSimplifiedMode()
    
    // Provide feedback channel
    this.provideFeedbackChannel()
    
    // Document incident
    this.documentIncident()
  }
  
  // Support methods
  private disableAllPerformanceFeatures() {
    const features = [
      'enableVirtualization',
      'enableCaching',
      'enableChunking',
      'enableSubtreeFreezing',
      'enableBackpressure',
      'enableLazyMounting',
      'enableCssContainment',
      'enableOutputCollapsing'
    ]
    
    features.forEach(feature => {
      budgetEnforcer.disableEnforcement(feature)
    })
  }
  
  private disableAdvancedFeatures() {
    const advancedFeatures = [
      'enableVirtualization',
      'enableChunking',
      'enableSubtreeFreezing',
      'enableLazyMounting'
    ]
    
    advancedFeatures.forEach(feature => {
      budgetEnforcer.disableEnforcement(feature)
    })
  }
  
  private enableBasicMode() {
    // Keep only essential features
    const basicFeatures = [
      'enableCaching',
      'enableCssContainment'
    ]
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('basic-mode', 'true')
      localStorage.setItem('enabled-features', JSON.stringify(basicFeatures))
    }
  }
  
  private reduceComplexity() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('complexity-level', 'basic')
      localStorage.setItem('rendering-quality', 'low')
    }
  }
  
  private clearAllCaches() {
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('cache-'))
      keys.forEach(key => localStorage.removeItem(key))
    }
  }
  
  private reduceQuality() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rendering-quality', 'low')
      localStorage.setItem('animation-quality', 'disabled')
    }
  }
  
  private throttleUpdates() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('update-throttle', 'aggressive')
      localStorage.setItem('render-throttle', '0.5')
    }
  }
  
  private setEmergencyMode(enabled: boolean) {
    this.emergencyMode = enabled
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('emergency-mode', enabled.toString())
      localStorage.setItem('emergency-mode-timestamp', Date.now().toString())
    }
  }
  
  private monitorRecovery() {
    // Monitor system recovery for 5 minutes
    let recoveryAttempts = 0
    const maxAttempts = 10
    
    const recoveryInterval = setInterval(() => {
      const health = this.systemHealth.get('overall')
      
      if (health && health.score > 70) {
        console.log('✅ System recovered successfully')
        clearInterval(recoveryInterval)
        this.setEmergencyMode(false)
      } else {
        recoveryAttempts++
        
        if (recoveryAttempts >= maxAttempts) {
          console.error('❌ Recovery failed, escalating to full shutdown')
          this.executeFullShutdown()
          clearInterval(recoveryInterval)
        }
      }
    }, 30000) // Check every 30 seconds
  }
  
  private notifyAdministrators(procedure: string) {
    console.error(`📢 NOTIFYING ADMINISTRATORS: ${procedure}`)
    
    // In a real system, this would send notifications to administrators
    if (typeof window !== 'undefined') {
      const notifications = JSON.parse(localStorage.getItem('admin-notifications') || '[]')
      notifications.push({
        type: 'emergency',
        procedure,
        timestamp: Date.now(),
        systemHealth: this.systemHealth.get('overall')
      })
      
      localStorage.setItem('admin-notifications', JSON.stringify(notifications))
    }
  }
  
  private showPerformanceWarning() {
    // Show user-facing performance warning
    console.warn('⚠️ Showing performance warning to users')
  }
  
  private offerSimplifiedMode() {
    // Offer users the option to switch to simplified mode
    console.info('💡 Offering simplified mode to users')
  }
  
  private provideFeedbackChannel() {
    // Provide channel for user feedback
    console.info('💬 Providing feedback channel for users')
  }
  
  private documentIncident() {
    // Document the incident for future analysis
    console.info('📝 Documenting emergency incident')
    
    if (typeof window !== 'undefined') {
      const incidents = JSON.parse(localStorage.getItem('emergency-incidents') || '[]')
      incidents.push({
        timestamp: Date.now(),
        systemHealth: this.systemHealth.get('overall'),
        triggers: Array.from(this.emergencyTriggers.keys()),
        procedure: 'user_mitigation',
        resolved: false
      })
      
      localStorage.setItem('emergency-incidents', JSON.stringify(incidents))
    }
  }
  
  private logEmergencyEvent(triggerName: string, trigger: EmergencyTrigger, procedure?: EmergencyProcedure | null) {
    const event = {
      trigger: triggerName,
      severity: trigger.severity,
      procedure: procedure?.name,
      timestamp: Date.now(),
      systemHealth: this.systemHealth.get('overall'),
      emergencyMode: this.emergencyMode
    }
    
    console.error('🚨 Emergency event logged:', event)
    
    if (typeof window !== 'undefined') {
      const events = JSON.parse(localStorage.getItem('emergency-events') || '[]')
      events.push(event)
      
      // Keep only last 50 emergency events
      if (events.length > 50) {
        events.shift()
      }
      
      localStorage.setItem('emergency-events', JSON.stringify(events))
    }
  }
  
  private trackEmergencyProcedure(procedure: EmergencyProcedure) {
    if (typeof window !== 'undefined') {
      const procedures = JSON.parse(localStorage.getItem('emergency-procedures') || '[]')
      procedures.push({
        name: procedure.name,
        severity: procedure.severity,
        actions: procedure.actions,
        timestamp: Date.now(),
        success: true
      })
      
      localStorage.setItem('emergency-procedures', JSON.stringify(procedures))
    }
  }
  
  // Public API
  getEmergencyStatus(): EmergencyStatus {
    return {
      emergencyMode: this.emergencyMode,
      activeTriggers: Array.from(this.emergencyTriggers.keys()),
      systemHealth: this.systemHealth.get('overall'),
      lastCheck: Date.now()
    }
  }
  
  manualEmergencyTrigger(triggerName: string, reason: string) {
    const trigger = this.emergencyTriggers.get(triggerName)
    if (trigger) {
      console.warn(`🚨 MANUAL EMERGENCY TRIGGER: ${triggerName} - ${reason}`)
      this.triggerEmergency(triggerName, trigger)
    }
  }
  
  resolveEmergency() {
    console.log('✅ RESOLVING EMERGENCY - Returning to normal operation')
    this.setEmergencyMode(false)
    
    // Clear emergency state
    if (typeof window !== 'undefined') {
      localStorage.removeItem('emergency-mode')
      localStorage.removeItem('emergency-mode-timestamp')
    }
  }
}

interface EmergencyTrigger {
  name: string
  condition: () => boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  autoTrigger: boolean
  cooldown: number
}

interface EmergencyProcedure {
  name: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  actions: string[]
  execute: () => void
}

interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical'
  score: number
  lastUpdate: number
  metrics: any
}

interface EmergencyStatus {
  emergencyMode: boolean
  activeTriggers: string[]
  systemHealth?: HealthStatus
  lastCheck: number
}

// Global emergency system instance
export const emergencySystem = new EmergencySystem()

// Reactive hook for emergency system
export function useEmergencySystem() {
  const [status, setStatus] = createSignal<EmergencyStatus>(emergencySystem.getEmergencyStatus())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStatus(emergencySystem.getEmergencyStatus())
    }, 3000) // Update every 3 seconds
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    status,
    manualEmergencyTrigger: (triggerName: string, reason: string) => 
      emergencySystem.manualEmergencyTrigger(triggerName, reason),
    resolveEmergency: () => emergencySystem.resolveEmergency()
  }
}
