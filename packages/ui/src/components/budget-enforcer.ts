import { createSignal, createEffect, onCleanup } from "solid-js"
import { usePerformanceMetrics } from "../features/performance-flags"

// Performance Budget Enforcement System for Phase 2
export class BudgetEnforcer {
  private budgets = new Map<string, PerformanceBudget>()
  private violations = new Map<string, BudgetViolation>()
  private enforcement = new Map<string, EnforcementAction>()
  
  constructor() {
    this.initializeBudgets()
    this.startMonitoring()
  }
  
  private initializeBudgets() {
    // Core performance budgets
    this.budgets.set('render_time', {
      name: 'render_time',
      budget: 16, // 16ms for 60fps
      current: 0,
      unit: 'ms',
      critical: 32,
      warning: 24,
      enforcement: 'throttle'
    })
    
    this.budgets.set('memory_usage', {
      name: 'memory_usage',
      budget: 100, // 100MB
      current: 0,
      unit: 'MB',
      critical: 200,
      warning: 150,
      enforcement: 'cleanup'
    })
    
    this.budgets.set('latency', {
      name: 'latency',
      budget: 50, // 50ms
      current: 0,
      unit: 'ms',
      critical: 100,
      warning: 75,
      enforcement: 'optimize'
    })
    
    this.budgets.set('fps', {
      name: 'fps',
      budget: 55, // 55fps minimum
      current: 60,
      unit: 'fps',
      critical: 30,
      warning: 45,
      enforcement: 'reduce_quality'
    })
    
    this.budgets.set('cpu_usage', {
      name: 'cpu_usage',
      budget: 70, // 70% CPU usage
      current: 0,
      unit: '%',
      critical: 90,
      warning: 80,
      enforcement: 'throttle'
    })
    
    // Feature-specific budgets
    this.budgets.set('virtualization_items', {
      name: 'virtualization_items',
      budget: 1000, // Max 1000 virtualized items
      current: 0,
      unit: 'items',
      critical: 2000,
      warning: 1500,
      enforcement: 'disable'
    })
    
    this.budgets.set('cache_size', {
      name: 'cache_size',
      budget: 50, // 50MB cache
      current: 0,
      unit: 'MB',
      critical: 100,
      warning: 75,
      enforcement: 'clear'
    })
    
    this.budgets.set('chunk_size', {
      name: 'chunk_size',
      budget: 1000, // 1000 characters per chunk
      current: 0,
      unit: 'chars',
      critical: 5000,
      warning: 2500,
      enforcement: 'split'
    })
  }
  
  private startMonitoring() {
    // Monitor performance metrics every second
    setInterval(() => {
      this.checkAllBudgets()
    }, 1000)
  }
  
  updateMetric(name: string, value: number) {
    const budget = this.budgets.get(name)
    if (budget) {
      budget.current = value
      this.checkBudgetViolation(budget)
    }
  }
  
  private checkAllBudgets() {
    for (const budget of this.budgets.values()) {
      this.checkBudgetViolation(budget)
    }
  }
  
  private checkBudgetViolation(budget: PerformanceBudget) {
    const violation = this.getViolationLevel(budget)
    
    if (violation === 'none') {
      // Clear any existing violation
      this.violations.delete(budget.name)
      return
    }
    
    // Record violation
    const existingViolation = this.violations.get(budget.name)
    
    if (!existingViolation || existingViolation.level !== violation) {
      const newViolation: BudgetViolation = {
        metric: budget.name,
        level: violation,
        current: budget.current,
        budget: budget.budget,
        threshold: violation === 'critical' ? budget.critical : budget.warning,
        timestamp: Date.now(),
        duration: 0,
        actions: []
      }
      
      this.violations.set(budget.name, newViolation)
      
      // Trigger enforcement action
      this.triggerEnforcement(budget, violation)
    } else {
      // Update duration
      existingViolation.duration = Date.now() - existingViolation.timestamp
    }
  }
  
  private getViolationLevel(budget: PerformanceBudget): 'none' | 'warning' | 'critical' {
    if (budget.current >= budget.critical) return 'critical'
    if (budget.current >= budget.warning) return 'warning'
    return 'none'
  }
  
  private triggerEnforcement(budget: PerformanceBudget, violation: 'warning' | 'critical') {
    const action = this.getEnforcementAction(budget, violation)
    
    if (action) {
      this.executeEnforcement(action)
      
      // Record action
      const violationRecord = this.violations.get(budget.name)
      if (violationRecord) {
        violationRecord.actions.push({
          type: action.type,
          description: action.description,
          severity: action.severity,
          metric: action.metric,
          action: action.action,
          executed: true,
          timestamp: Date.now()
        })
      }
    }
  }
  
  private getEnforcementAction(budget: PerformanceBudget, violation: 'warning' | 'critical'): EnforcementAction | null {
    const actions = {
      throttle: {
        type: 'throttle',
        description: `Throttling ${budget.name} due to ${violation} violation`,
        severity: violation,
        metric: budget.name,
        action: () => this.applyThrottling(budget.name, violation),
        executed: false
      },
      cleanup: {
        type: 'cleanup',
        description: `Cleaning up ${budget.name} due to ${violation} violation`,
        severity: violation,
        metric: budget.name,
        action: () => this.applyCleanup(budget.name, violation),
        executed: false
      },
      optimize: {
        type: 'optimize',
        description: `Optimizing ${budget.name} due to ${violation} violation`,
        severity: violation,
        metric: budget.name,
        action: () => this.applyOptimization(budget.name, violation),
        executed: false
      },
      reduce_quality: {
        type: 'reduce_quality',
        description: `Reducing quality for ${budget.name} due to ${violation} violation`,
        severity: violation,
        metric: budget.name,
        action: () => this.applyQualityReduction(budget.name, violation),
        executed: false
      },
      disable: {
        type: 'disable',
        description: `Disabling ${budget.name} due to critical violation`,
        severity: 'critical',
        metric: budget.name,
        action: () => this.applyDisabling(budget.name),
        executed: false
      },
      clear: {
        type: 'clear',
        description: `Clearing ${budget.name} due to ${violation} violation`,
        severity: violation,
        metric: budget.name,
        action: () => this.applyClearing(budget.name),
        executed: false
      },
      split: {
        type: 'split',
        description: `Splitting ${budget.name} due to ${violation} violation`,
        severity: violation,
        metric: budget.name,
        action: () => this.applySplitting(budget.name),
        executed: false
      }
    }
    
    return actions[budget.enforcement as keyof typeof actions] as EnforcementAction | null
  }
  
  private executeEnforcement(action: EnforcementAction) {
    console.warn(`🚡 BUDGET ENFORCEMENT: ${action.description}`)
    
    try {
      action.action()
      
      // Store enforcement action
      this.enforcement.set(`${action.metric}-${Date.now()}`, action)
      
      // Track enforcement for analytics
      this.trackEnforcement(action)
      
    } catch (error) {
      console.error(`❌ Enforcement failed: ${action.description}`, error)
    }
  }
  
  private applyThrottling(metric: string, violation: 'warning' | 'critical') {
    // Apply throttling based on metric
    switch (metric) {
      case 'render_time':
        this.throttleRendering(violation)
        break
      case 'cpu_usage':
        this.throttleCPU(violation)
        break
      default:
        this.generalThrottling(violation)
    }
  }
  
  private applyCleanup(metric: string, violation: 'warning' | 'critical') {
    // Apply cleanup based on metric
    switch (metric) {
      case 'memory_usage':
        this.cleanupMemory(violation)
        break
      default:
        this.generalCleanup(violation)
    }
  }
  
  private applyOptimization(metric: string, violation: 'warning' | 'critical') {
    // Apply optimization based on metric
    switch (metric) {
      case 'latency':
        this.optimizeLatency(violation)
        break
      default:
        this.generalOptimization(violation)
    }
  }
  
  private applyQualityReduction(metric: string, violation: 'warning' | 'critical') {
    // Reduce quality for FPS issues
    this.reduceRenderingQuality(violation)
  }
  
  private applyDisabling(metric: string) {
    // Disable feature completely
    console.warn(`🚫 Disabling ${metric} due to critical violation`)
    
    // Store disabled state
    if (typeof window !== 'undefined') {
      const disabled = JSON.parse(localStorage.getItem('disabled-features') || '[]')
      if (!disabled.includes(metric)) {
        disabled.push(metric)
        localStorage.setItem('disabled-features', JSON.stringify(disabled))
      }
    }
  }
  
  private applyClearing(metric: string) {
    // Clear cache or data
    console.warn(`🧹 Clearing ${metric} due to violation`)
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`cache-${metric}`)
    }
  }
  
  private applySplitting(metric: string) {
    // Split large chunks
    console.warn(`✂️ Splitting ${metric} due to violation`)
  }
  
  // Specific enforcement implementations
  private throttleRendering(violation: 'warning' | 'critical') {
    const factor = violation === 'critical' ? 0.5 : 0.75
    
    // Update render throttling
    if (typeof window !== 'undefined') {
      localStorage.setItem('render-throttle-factor', factor.toString())
    }
  }
  
  private throttleCPU(violation: 'warning' | 'critical') {
    const factor = violation === 'critical' ? 0.6 : 0.8
    
    // Update CPU throttling
    if (typeof window !== 'undefined') {
      localStorage.setItem('cpu-throttle-factor', factor.toString())
    }
  }
  
  private generalThrottling(violation: 'warning' | 'critical') {
    const factor = violation === 'critical' ? 0.7 : 0.85
    
    // Update general throttling
    if (typeof window !== 'undefined') {
      localStorage.setItem('general-throttle-factor', factor.toString())
    }
  }
  
  private cleanupMemory(violation: 'warning' | 'critical') {
    // Trigger garbage collection if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc()
    }
    
    // Clear unnecessary caches
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('cache-'))
      keys.forEach(key => localStorage.removeItem(key))
    }
  }
  
  private generalCleanup(violation: 'warning' | 'critical') {
    // General cleanup
    this.cleanupMemory(violation)
  }
  
  private optimizeLatency(violation: 'warning' | 'critical') {
    // Optimize for lower latency
    if (typeof window !== 'undefined') {
      localStorage.setItem('latency-optimization', 'aggressive')
    }
  }
  
  private generalOptimization(violation: 'warning' | 'critical') {
    // General optimization
    if (typeof window !== 'undefined') {
      localStorage.setItem('performance-optimization', violation)
    }
  }
  
  private reduceRenderingQuality(violation: 'warning' | 'critical') {
    const quality = violation === 'critical' ? 'low' : 'medium'
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('rendering-quality', quality)
    }
  }
  
  private trackEnforcement(action: EnforcementAction) {
    if (typeof window !== 'undefined') {
      const enforcementHistory = JSON.parse(localStorage.getItem('budget-enforcement-history') || '[]')
      enforcementHistory.push({
        ...action,
        timestamp: Date.now(),
        executed: true
      })
      
      // Keep only last 100 enforcement actions
      if (enforcementHistory.length > 100) {
        enforcementHistory.shift()
      }
      
      localStorage.setItem('budget-enforcement-history', JSON.stringify(enforcementHistory))
    }
  }
  
  // Public API
  getBudgetStatus(): BudgetStatus {
    const violations = Array.from(this.violations.values())
    const activeEnforcements = Array.from(this.enforcement.values()).filter(e => !e.resolved)
    
    return {
      totalBudgets: this.budgets.size,
      violations: violations.length,
      criticalViolations: violations.filter(v => v.level === 'critical').length,
      warningViolations: violations.filter(v => v.level === 'warning').length,
      activeEnforcements: activeEnforcements.length,
      lastCheck: Date.now()
    }
  }
  
  getBudgetDetails(): PerformanceBudget[] {
    return Array.from(this.budgets.values())
  }
  
  getViolations(): BudgetViolation[] {
    return Array.from(this.violations.values())
  }
  
  getEnforcementHistory(): EnforcementAction[] {
    if (typeof window === 'undefined') return []
    
    return JSON.parse(localStorage.getItem('budget-enforcement-history') || '[]')
  }
  
  // Manual override
  overrideBudget(metric: string, newBudget: number) {
    const budget = this.budgets.get(metric)
    if (budget) {
      budget.budget = newBudget
      console.log(`📊 Budget overridden: ${metric} = ${newBudget}${budget.unit}`)
    }
  }
  
  disableEnforcement(metric: string) {
    const budget = this.budgets.get(metric)
    if (budget) {
      budget.enforcement = 'none'
      console.log(`🚫 Enforcement disabled: ${metric}`)
    }
  }
}

interface PerformanceBudget {
  name: string
  budget: number
  current: number
  unit: string
  critical: number
  warning: number
  enforcement: 'throttle' | 'cleanup' | 'optimize' | 'reduce_quality' | 'disable' | 'clear' | 'split' | 'none'
}

interface BudgetViolation {
  metric: string
  level: 'warning' | 'critical'
  current: number
  budget: number
  threshold: number
  timestamp: number
  duration: number
  actions: EnforcementAction[]
}

interface EnforcementAction {
  type: string
  description: string
  severity: 'warning' | 'critical'
  metric: string
  action: () => void
  executed: boolean
  resolved?: boolean
  timestamp?: number
}

interface BudgetStatus {
  totalBudgets: number
  violations: number
  criticalViolations: number
  warningViolations: number
  activeEnforcements: number
  lastCheck: number
}

// Global budget enforcer instance
export const budgetEnforcer = new BudgetEnforcer()

// Reactive hook for budget enforcement
export function useBudgetEnforcer() {
  const [status, setStatus] = createSignal<BudgetStatus>(budgetEnforcer.getBudgetStatus())
  const [violations, setViolations] = createSignal<BudgetViolation[]>(budgetEnforcer.getViolations())
  const [budgets, setBudgets] = createSignal<PerformanceBudget[]>(budgetEnforcer.getBudgetDetails())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStatus(budgetEnforcer.getBudgetStatus())
      setViolations(budgetEnforcer.getViolations())
      setBudgets(budgetEnforcer.getBudgetDetails())
    }, 2000) // Update every 2 seconds
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    status,
    violations,
    budgets,
    updateMetric: (name: string, value: number) => budgetEnforcer.updateMetric(name, value),
    overrideBudget: (metric: string, newBudget: number) => budgetEnforcer.overrideBudget(metric, newBudget),
    disableEnforcement: (metric: string) => budgetEnforcer.disableEnforcement(metric)
  }
}
