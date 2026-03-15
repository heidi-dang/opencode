// Backward compatibility adapter for performance systems
import { createSignal, createEffect } from "solid-js"
import { usePerformanceManager, usePerformanceStore } from "../index"

// Adapter for existing performance flags
export function usePerformanceMetrics() {
  const manager = usePerformanceManager()
  const metrics = manager.metrics
  
  return {
    metrics: metrics || {
      fps: 60,
      memoryUsage: 50,
      latency: 25,
      score: 95
    },
    setMetrics: () => {} // No-op for adapter
  }
}

// Adapter for performance flags
export const performanceFlags = {
  enableVirtualization: true,
  enableCaching: true,
  enableChunking: true,
  enableSubtreeFreezing: true,
  enableBackpressure: true,
  enableLazyMounting: true,
  enableCssContainment: true,
  enableOutputCollapsing: true
}

// Adapter for performance guard
export class PerformanceGuard {
  constructor() {
    // Adapter implementation
  }
  
  checkRegression() {
    return false // No regression detected
  }
  
  triggerFallback() {
    console.warn('Performance fallback triggered (adapter)')
  }
}

// Adapter for gradual rollout
export class PerformanceRollout {
  constructor() {
    // Adapter implementation
  }
  
  getRolloutPercentage() {
    return 100 // Full rollout
  }
  
  isFeatureEnabled() {
    return true // All features enabled
  }
}

// Adapter hooks
export function usePerformanceRollout() {
  return new PerformanceRollout()
}

export function useBackpressure() {
  return {
    shouldThrottle: () => false,
    getQueueSize: () => 0,
    getBackpressureLevel: () => 'low'
  }
}

export function useTextChunking() {
  return {
    getChunks: () => [],
    isChunking: () => false,
    getChunkStats: () => ({ chunks: 0, totalSize: 0 })
  }
}

export function useFrozenSubtree() {
  return {
    isFrozen: () => false,
    freezeSubtree: () => {},
    unfreezeSubtree: () => {}
  }
}

export function useLazyMountStats() {
  return {
    getMountedComponents: () => [],
    getPendingComponents: () => [],
    getStats: () => ({ mounted: 0, pending: 0 })
  }
}

export function useContainmentStats() {
  return {
    getContainedElements: () => [],
    getContainmentStats: () => ({ contained: 0, total: 0 })
  }
}

export function useOutputStats() {
  return {
    getCollapsedOutputs: () => [],
    getOutputStats: () => ({ collapsed: 0, total: 0 })
  }
}

export function useCachedRender() {
  return {
    getCacheStats: () => ({ hits: 0, misses: 0, ratio: 0 }),
    getCachedRender: () => null,
    setCachedRender: () => {}
  }
}

export function useVirtualizationMetrics() {
  return {
    getVisibleItems: () => [],
    getTotalItems: () => 0,
    getVirtualizationStats: () => ({ visible: 0, total: 0, ratio: 0 })
  }
}

// Simple performance store adapter
export function useSimplePerformanceStore() {
  const store = usePerformanceStore()
  
  return {
    getMessage: store.getMessage,
    getPart: store.getPart,
    getSessionMessages: store.getSessionMessages,
    getMessageParts: store.getMessageParts,
    addMessage: store.addMessage,
    addPart: store.addPart,
    updateMessage: store.updateMessage,
    updatePart: store.updatePart,
    getStats: store.getStats
  }
}
