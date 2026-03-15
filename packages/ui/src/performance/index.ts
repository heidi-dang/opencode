// Main entry point for performance module
export * from './shared/index'
export * from './manager'

// Re-export core systems
export * from './core/index'

// Re-export safety systems
export * from './safety/index'

// Re-export advanced systems
export * from './advanced/index'

// Re-export dashboards
export * from './dashboards/index'

// Global instances
export { performanceManager } from './manager'
export { performanceStore } from './shared/store'

// Reactive hooks
export { usePerformanceManager } from './manager'
export { usePerformanceStore } from './shared/store'
