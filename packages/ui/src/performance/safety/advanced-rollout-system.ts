import { createSignal, createEffect, onCleanup } from "solid-js"
import { performanceRollout } from "./gradual-rollout"

// Advanced Gradual Rollout System for Phase 2
export class AdvancedRolloutSystem {
  private rolloutPhases = [
    { tier: 1, percentage: 5, name: "Internal Team", duration: 3600000 }, // 1 hour
    { tier: 2, percentage: 10, name: "Power Users", duration: 7200000 }, // 2 hours
    { tier: 3, percentage: 25, name: "Beta Users", duration: 14400000 }, // 4 hours
    { tier: 4, percentage: 50, name: "Early Adopters", duration: 28800000 }, // 8 hours
    { tier: 5, percentage: 100, name: "All Users", duration: null } // Permanent
  ]
  
  private currentPhase = 0
  private phaseStartTime = Date.now()
  private rolloutMetrics = new Map<string, RolloutMetrics>()
  private performanceThresholds = {
    maxErrorRate: 0.01, // 1%
    minPerformanceScore: 85,
    maxLatencyIncrease: 20, // 20% increase
    maxMemoryIncrease: 15 // 15% increase
  }
  
  getCurrentPhase() {
    return this.rolloutPhases[this.currentPhase]
  }
  
  getRolloutProgress() {
    const currentPhase = this.getCurrentPhase()
    const elapsed = Date.now() - this.phaseStartTime
    const progress = Math.min(100, (elapsed / (currentPhase.duration || 1)) * 100)
    
    return {
      phase: this.currentPhase + 1,
      totalPhases: this.rolloutPhases.length,
      progress,
      currentTier: currentPhase.tier,
      rolloutPercentage: currentPhase.percentage,
      phaseName: currentPhase.name
    }
  }
  
  shouldAdvancePhase(): boolean {
    const currentPhase = this.getCurrentPhase()
    const elapsed = Date.now() - this.phaseStartTime
    
    // Check if duration has passed
    if (currentPhase.duration && elapsed >= currentPhase.duration) {
      return this.checkPhaseHealth()
    }
    
    return false
  }
  
  private checkPhaseHealth(): boolean {
    const metrics = this.getCurrentPhaseMetrics()
    
    // Check all performance thresholds
    const healthy = 
      metrics.errorRate <= this.performanceThresholds.maxErrorRate &&
      metrics.performanceScore >= this.performanceThresholds.minPerformanceScore &&
      metrics.latencyIncrease <= this.performanceThresholds.maxLatencyIncrease &&
      metrics.memoryIncrease <= this.performanceThresholds.maxMemoryIncrease
    
    return healthy
  }
  
  getCurrentPhaseMetrics(): RolloutMetrics {
    const phaseKey = `phase-${this.currentPhase}`
    let metrics = this.rolloutMetrics.get(phaseKey)
    
    if (!metrics) {
      metrics = {
        errorRate: 0,
        performanceScore: 95,
        latencyIncrease: 0,
        memoryIncrease: 0,
        userCount: 0,
        activeUsers: 0,
        errors: 0,
        timestamp: Date.now()
      }
      this.rolloutMetrics.set(phaseKey, metrics)
    }
    
    return metrics
  }
  
  advancePhase() {
    if (this.currentPhase < this.rolloutPhases.length - 1) {
      this.currentPhase++
      this.phaseStartTime = Date.now()
      
      console.log(`🚀 Advancing to Phase ${this.currentPhase + 1}: ${this.getCurrentPhase().name}`)
      
      // Update rollout configuration
      this.updateRolloutConfiguration()
      
      return true
    }
    
    return false
  }
  
  rollbackPhase(reason: string) {
    if (this.currentPhase > 0) {
      const previousPhase = this.currentPhase
      this.currentPhase = Math.max(0, this.currentPhase - 1)
      this.phaseStartTime = Date.now()
      
      console.log(`🔄 Rolling back from Phase ${previousPhase + 1} to Phase ${this.currentPhase + 1}: ${reason}`)
      
      // Update rollout configuration
      this.updateRolloutConfiguration()
      
      return true
    }
    
    return false
  }
  
  private updateRolloutConfiguration() {
    const currentPhase = this.getCurrentPhase()
    
    // Update feature flags based on current phase
    const rolloutConfig = {
      phase: this.currentPhase + 1,
      percentage: currentPhase.percentage,
      tier: currentPhase.tier,
      features: this.getFeaturesForTier(currentPhase.tier)
    }
    
    // Store rollout state
    if (typeof window !== 'undefined') {
      localStorage.setItem('advanced-rollout-config', JSON.stringify(rolloutConfig))
      localStorage.setItem('advanced-rollout-phase', this.currentPhase.toString())
    }
  }
  
  private getFeaturesForTier(tier: number) {
    const features = {
      1: {
        // Internal Team - All features enabled
        enableVirtualization: true,
        enableCaching: true,
        enableChunking: true,
        enableSubtreeFreezing: true,
        enableBackpressure: true,
        enableLazyMounting: true,
        enableCssContainment: true,
        enableOutputCollapsing: true
      },
      2: {
        // Power Users - Core performance features
        enableVirtualization: true,
        enableCaching: true,
        enableChunking: true,
        enableSubtreeFreezing: false,
        enableBackpressure: true,
        enableLazyMounting: false,
        enableCssContainment: true,
        enableOutputCollapsing: false
      },
      3: {
        // Beta Users - Basic optimizations
        enableVirtualization: true,
        enableCaching: true,
        enableChunking: false,
        enableSubtreeFreezing: false,
        enableBackpressure: false,
        enableLazyMounting: false,
        enableCssContainment: true,
        enableOutputCollapsing: false
      },
      4: {
        // Early Adopters - Minimal optimizations
        enableVirtualization: true,
        enableCaching: false,
        enableChunking: false,
        enableSubtreeFreezing: false,
        enableBackpressure: false,
        enableLazyMounting: false,
        enableCssContainment: false,
        enableOutputCollapsing: false
      },
      5: {
        // All Users - Production safe features only
        enableVirtualization: false,
        enableCaching: false,
        enableChunking: false,
        enableSubtreeFreezing: false,
        enableBackpressure: false,
        enableLazyMounting: false,
        enableCssContainment: false,
        enableOutputCollapsing: false
      }
    }
    
    return features[tier as keyof typeof features] || features[5]
  }
  
  recordMetrics(metrics: Partial<RolloutMetrics>) {
    const currentMetrics = this.getCurrentPhaseMetrics()
    
    // Update metrics
    Object.assign(currentMetrics, metrics, { timestamp: Date.now() })
    
    // Check if we need to rollback
    if (!this.checkPhaseHealth()) {
      this.rollbackPhase('Performance thresholds exceeded')
    }
  }
  
  getRolloutStatus(): RolloutStatus {
    const progress = this.getRolloutProgress()
    const metrics = this.getCurrentPhaseMetrics()
    
    return {
      ...progress,
      metrics,
      healthy: this.checkPhaseHealth(),
      canAdvance: this.shouldAdvancePhase(),
      nextPhase: this.currentPhase < this.rolloutPhases.length - 1 ? this.currentPhase + 2 : null
    }
  }
  
  // Emergency procedures
  emergencyRollback(reason: string) {
    console.error(`🚨 EMERGENCY ROLLBACK: ${reason}`)
    
    // Rollback to phase 0 (internal team only)
    this.currentPhase = 0
    this.phaseStartTime = Date.now()
    
    // Disable all features
    this.updateRolloutConfiguration()
    
    // Log emergency event
    this.logEmergencyEvent(reason)
    
    return true
  }
  
  private logEmergencyEvent(reason: string) {
    const event = {
      type: 'emergency_rollback',
      reason,
      phase: this.currentPhase,
      timestamp: Date.now(),
      metrics: this.getCurrentPhaseMetrics()
    }
    
    // Store emergency event
    if (typeof window !== 'undefined') {
      const events = JSON.parse(localStorage.getItem('emergency-events') || '[]')
      events.push(event)
      localStorage.setItem('emergency-events', JSON.stringify(events))
    }
    
    console.error('🚨 Emergency rollback event logged:', event)
  }
}

interface RolloutMetrics {
  errorRate: number
  performanceScore: number
  latencyIncrease: number
  memoryIncrease: number
  userCount: number
  activeUsers: number
  errors: number
  timestamp: number
}

interface RolloutStatus {
  phase: number
  totalPhases: number
  progress: number
  currentTier: number
  rolloutPercentage: number
  phaseName: string
  metrics: RolloutMetrics
  healthy: boolean
  canAdvance: boolean
  nextPhase: number | null
}

// Global advanced rollout instance
export const advancedRolloutSystem = new AdvancedRolloutSystem()

// Reactive hook for advanced rollout
export function useAdvancedRollout() {
  const [status, setStatus] = createSignal<RolloutStatus>(advancedRolloutSystem.getRolloutStatus())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStatus(advancedRolloutSystem.getRolloutStatus())
    }, 1000) // Update every second
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    status,
    advancePhase: () => advancedRolloutSystem.advancePhase(),
    rollbackPhase: (reason: string) => advancedRolloutSystem.rollbackPhase(reason),
    emergencyRollback: (reason: string) => advancedRolloutSystem.emergencyRollback(reason),
    recordMetrics: (metrics: Partial<RolloutMetrics>) => advancedRolloutSystem.recordMetrics(metrics)
  }
}
