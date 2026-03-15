import { createSignal, createEffect, onCleanup } from "solid-js"
import { performanceManager } from "../manager"
import { PERFORMANCE_FLAGS, INTEGRATION_PHASES } from "../shared/types"

// Feature Flag Manager for gradual integration
export class FeatureFlagManager {
  private flags = new Map<string, boolean>()
  private listeners = new Set<() => void>()
  private storageKey = 'performance-feature-flags'
  
  constructor() {
    this.loadFlags()
    this.setupDefaultFlags()
  }
  
  loadFlags() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const parsedFlags = JSON.parse(stored)
        Object.entries(parsedFlags).forEach(([key, value]) => {
          this.flags.set(key, value as boolean)
        })
      }
    }
  }
  
  private setupDefaultFlags() {
    // Set default flags if not already set
    const defaultFlags = {
      // Core foundation (Phase 1)
      'core.virtualization': false,
      'core.caching': false,
      'core.chunking': false,
      'core.subtreeFreezing': false,
      'core.backpressure': false,
      'core.lazyMounting': false,
      'core.cssContainment': false,
      'core.outputCollapsing': false,
      
      // Production safety (Phase 2)
      'safety.rollout': false,
      'safety.budgetEnforcement': false,
      'safety.emergencySystems': false,
      'safety.productionAnalytics': false,
      
      // Advanced optimization (Phase 3)
      'advanced.predictivePreloading': false,
      'advanced.mlOptimization': false,
      'advanced.realTimeAnalytics': false,
      'advanced.uxOptimization': false
    }
    
    Object.entries(defaultFlags).forEach(([key, value]) => {
      if (!this.flags.has(key)) {
        this.flags.set(key, value)
      }
    })
  }
  
  isEnabled(flag: string): boolean {
    return this.flags.get(flag) || false
  }
  
  setFlag(flag: string, enabled: boolean): void {
    this.flags.set(flag, enabled)
    this.saveFlags()
    this.notifyListeners()
  }
  
  toggleFlag(flag: string): void {
    const current = this.isEnabled(flag)
    this.setFlag(flag, !current)
  }
  
  getPhaseFlags(phase: 'core' | 'safety' | 'advanced'): Record<string, boolean> {
    const phaseFlags: Record<string, boolean> = {}
    
    this.flags.forEach((value, key) => {
      if (key.startsWith(`${phase}.`)) {
        phaseFlags[key] = value
      }
    })
    
    return phaseFlags
  }
  
  enablePhase(phase: 'core' | 'safety' | 'advanced'): void {
    const phaseFlags = this.getPhaseFlags(phase)
    Object.keys(phaseFlags).forEach(flag => {
      this.setFlag(flag, true)
    })
  }
  
  disablePhase(phase: 'core' | 'safety' | 'advanced'): void {
    const phaseFlags = this.getPhaseFlags(phase)
    Object.keys(phaseFlags).forEach(flag => {
      this.setFlag(flag, false)
    })
  }
  
  getAllFlags(): Record<string, boolean> {
    const allFlags: Record<string, boolean> = {}
    this.flags.forEach((value, key) => {
      allFlags[key] = value
    })
    return allFlags
  }
  
  getEnabledCount(): number {
    let count = 0
    this.flags.forEach(value => {
      if (value) count++
    })
    return count
  }
  
  getTotalCount(): number {
    return this.flags.size
  }
  
  getProgress(): number {
    return this.getEnabledCount() / this.getTotalCount()
  }
  
  private saveFlags(): void {
    if (typeof window !== 'undefined') {
      const allFlags = this.getAllFlags()
      localStorage.setItem(this.storageKey, JSON.stringify(allFlags))
    }
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener())
  }
  
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  
  reset(): void {
    this.flags.clear()
    this.setupDefaultFlags()
    this.saveFlags()
    this.notifyListeners()
  }
  
  // Integration phase management
  enableIntegrationPhase(phase: 'core' | 'safety' | 'advanced'): void {
    this.enablePhase(phase)
    console.log(`✅ Integration phase ${phase} enabled`)
  }
  
  disableIntegrationPhase(phase: 'core' | 'safety' | 'advanced'): void {
    this.disablePhase(phase)
    console.log(`🔴 Integration phase ${phase} disabled`)
  }
  
  getIntegrationStatus(): {
    core: boolean
    safety: boolean
    advanced: boolean
    overall: number
  } {
    const coreFlags = this.getPhaseFlags('core')
    const safetyFlags = this.getPhaseFlags('safety')
    const advancedFlags = this.getPhaseFlags('advanced')
    
    const coreEnabled = Object.values(coreFlags).some(v => v)
    const safetyEnabled = Object.values(safetyFlags).some(v => v)
    const advancedEnabled = Object.values(advancedFlags).some(v => v)
    
    const overall = (coreEnabled ? 1 : 0) + (safetyEnabled ? 1 : 0) + (advancedEnabled ? 1 : 0) / 3
    
    return {
      core: coreEnabled,
      safety: safetyEnabled,
      advanced: advancedEnabled,
      overall
    }
  }
}

// Global feature flag manager instance
export const featureFlagManager = new FeatureFlagManager()

// Reactive hook for feature flags
export function useFeatureFlags() {
  const [flags, setFlags] = createSignal<Record<string, boolean>>(featureFlagManager.getAllFlags())
  const [integrationStatus, setIntegrationStatus] = createSignal(featureFlagManager.getIntegrationStatus())
  
  createEffect(() => {
    const unsubscribe = featureFlagManager.subscribe(() => {
      setFlags(featureFlagManager.getAllFlags())
      setIntegrationStatus(featureFlagManager.getIntegrationStatus())
    })
    
    onCleanup(() => unsubscribe())
  })
  
  return {
    flags,
    integrationStatus,
    isEnabled: (flag: string) => featureFlagManager.isEnabled(flag),
    setFlag: (flag: string, enabled: boolean) => featureFlagManager.setFlag(flag, enabled),
    toggleFlag: (flag: string) => featureFlagManager.toggleFlag(flag),
    enablePhase: (phase: 'core' | 'safety' | 'advanced') => featureFlagManager.enablePhase(phase),
    disablePhase: (phase: 'core' | 'safety' | 'advanced') => featureFlagManager.disablePhase(phase),
    enableIntegrationPhase: (phase: 'core' | 'safety' | 'advanced') => featureFlagManager.enableIntegrationPhase(phase),
    disableIntegrationPhase: (phase: 'core' | 'safety' | 'advanced') => featureFlagManager.disableIntegrationPhase(phase),
    getProgress: () => featureFlagManager.getProgress(),
    reset: () => featureFlagManager.reset()
  }
}
