// Shared types for all performance systems
export interface PerformanceConfig {
  core: CoreConfig
  safety: SafetyConfig
  advanced: AdvancedConfig
}

export interface CoreConfig {
  virtualization: boolean
  caching: boolean
  chunking: boolean
  subtreeFreezing: boolean
  backpressure: boolean
  lazyMounting: boolean
  cssContainment: boolean
  outputCollapsing: boolean
}

export interface SafetyConfig {
  rollout: boolean
  budgetEnforcement: boolean
  emergencySystems: boolean
  productionAnalytics: boolean
}

export interface AdvancedConfig {
  predictivePreloading: boolean
  mlOptimization: boolean
  realTimeAnalytics: boolean
  uxOptimization: boolean
}

export interface PerformanceMetrics {
  core: CoreMetrics
  safety: SafetyMetrics
  advanced: AdvancedMetrics
  timestamp: number
}

export interface CoreMetrics {
  fps: number
  memoryUsage: number
  latency: number
  renderTime: number
  cacheHitRate: number
}

export interface SafetyMetrics {
  violations: number
  emergencyTriggers: number
  rolloutProgress: number
  systemHealth: number
}

export interface AdvancedMetrics {
  predictionAccuracy: number
  mlOptimizations: number
  realTimeAlerts: number
  uxAdaptations: number
}

export interface PerformanceAlert {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  component: 'core' | 'safety' | 'advanced'
  message: string
  value: number
  threshold: number
  timestamp: number
  resolved: boolean
}

export interface PerformanceSystem {
  name: string
  enabled: boolean
  healthy: boolean
  lastUpdate: number
  metrics: any
  alerts: PerformanceAlert[]
}

// Integration phases for gradual rollout
export const INTEGRATION_PHASES = {
  CORE_FOUNDATION: false,    // Phase 1
  PRODUCTION_SAFETY: false,  // Phase 2  
  ADVANCED_OPTIMIZATION: false // Phase 3
} as const

// Feature flags hierarchy
export const PERFORMANCE_FLAGS = {
  // Core foundation (Phase 1)
  core: {
    virtualization: false,
    caching: false,
    chunking: false,
    subtreeFreezing: false,
    backpressure: false,
    lazyMounting: false,
    cssContainment: false,
    outputCollapsing: false
  },
  
  // Production safety (Phase 2)  
  safety: {
    rollout: false,
    budgetEnforcement: false,
    emergencySystems: false,
    productionAnalytics: false
  },
  
  // Advanced optimization (Phase 3)
  advanced: {
    predictivePreloading: false,
    mlOptimization: false,
    realTimeAnalytics: false,
    uxOptimization: false
  }
} as const

// Performance budgets for the performance system itself
export const PERFORMANCE_SYSTEM_BUDGETS = {
  maxMemoryUsage: 50, // MB
  maxCPUUsage: 10, // percentage
  maxLatency: 5, // ms
  maxAlertRate: 1, // per minute
  maxMLOptimizations: 10 // per minute
} as const
