import { createSignal, createEffect, onCleanup } from "solid-js"

// Gradual rollout system for performance features
export class PerformanceRollout {
  private userTier: number
  private rolloutPercentages = [10, 30, 100] // Tier 1: 10%, Tier 2: 30%, Tier 3: 100%
  
  constructor() {
    this.userTier = this.getUserTier()
  }
  
  getUserTier(): number {
    // Simple tier assignment based on user ID or random for demo
    const userId = this.getUserId()
    const hash = this.simpleHash(userId)
    return (hash % 3) + 1 // 1, 2, or 3
  }
  
  getUserId(): string {
    // Get user ID from localStorage or generate random
    if (typeof window !== 'undefined' && window.localStorage) {
      let userId = localStorage.getItem('performance-tier-user')
      if (!userId) {
        userId = Math.random().toString(36).substring(7)
        localStorage.setItem('performance-tier-user', userId)
      }
      return userId
    }
    return 'anonymous'
  }
  
  simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
  
  getEnabledFeatures() {
    const rolloutPercentage = this.rolloutPercentages[this.userTier - 1] || 100
    const randomValue = Math.random() * 100
    
    return {
      // Tier 1: Power users (10%)
      virtualization: this.userTier >= 1 && randomValue < rolloutPercentage,
      caching: this.userTier >= 1 && randomValue < rolloutPercentage,
      
      // Tier 2: Beta users (30%)
      chunking: this.userTier >= 2 && randomValue < rolloutPercentage,
      subtreeFreezing: this.userTier >= 2 && randomValue < rolloutPercentage,
      
      // Tier 3: All users (100%)
      backpressure: this.userTier >= 3 && randomValue < rolloutPercentage,
      lazyMounting: this.userTier >= 3 && randomValue < rolloutPercentage,
      cssContainment: this.userTier >= 3 && randomValue < rolloutPercentage,
      outputCollapsing: this.userTier >= 3 && randomValue < rolloutPercentage
    }
  }
  
  getCurrentTier(): number {
    return this.userTier
  }
  
  getRolloutInfo() {
    return {
      userTier: this.userTier,
      rolloutPercentage: this.rolloutPercentages[this.userTier - 1] || 100,
      enabledFeatures: this.getEnabledFeatures()
    }
  }
}

// Global rollout instance
export const performanceRollout = new PerformanceRollout()

// Reactive hook for rollout status
export function usePerformanceRollout() {
  const [rolloutInfo, setRolloutInfo] = createSignal(performanceRollout.getRolloutInfo())
  
  createEffect(() => {
    // Update rollout info when needed
    const info = performanceRollout.getRolloutInfo()
    setRolloutInfo(info)
  })
  
  return rolloutInfo
}
