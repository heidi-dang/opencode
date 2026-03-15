import { createSignal, createEffect, onCleanup } from "solid-js"
import { PerformanceConfig, PerformanceMetrics, PerformanceAlert, PerformanceSystem } from "./shared/types"

// Unified Performance Manager - orchestrates all performance systems
export class PerformanceManager {
  private config: PerformanceConfig
  private metrics = new Map<string, PerformanceMetrics>()
  private alerts = new Map<string, PerformanceAlert>()
  private systems = new Map<string, PerformanceSystem>()
  private updateInterval: number | undefined
  
  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      core: {
        virtualization: false,
        caching: false,
        chunking: false,
        subtreeFreezing: false,
        backpressure: false,
        lazyMounting: false,
        cssContainment: false,
        outputCollapsing: false,
        ...config.core
      },
      safety: {
        rollout: false,
        budgetEnforcement: false,
        emergencySystems: false,
        productionAnalytics: false,
        ...config.safety
      },
      advanced: {
        predictivePreloading: false,
        mlOptimization: false,
        realTimeAnalytics: false,
        uxOptimization: false,
        ...config.advanced
      }
    }
    
    this.initializeSystems()
    this.startMonitoring()
  }
  
  private initializeSystems() {
    // Initialize core systems
    this.systems.set('core', {
      name: 'Core Performance',
      enabled: this.isEnabled('core'),
      healthy: true,
      lastUpdate: Date.now(),
      metrics: {},
      alerts: []
    })
    
    // Initialize safety systems
    this.systems.set('safety', {
      name: 'Production Safety',
      enabled: this.isEnabled('safety'),
      healthy: true,
      lastUpdate: Date.now(),
      metrics: {},
      alerts: []
    })
    
    // Initialize advanced systems
    this.systems.set('advanced', {
      name: 'Advanced Optimization',
      enabled: this.isEnabled('advanced'),
      healthy: true,
      lastUpdate: Date.now(),
      metrics: {},
      alerts: []
    })
  }
  
  private startMonitoring() {
    if (typeof window !== 'undefined') {
      this.updateInterval = window.setInterval(() => {
        this.updateMetrics()
        this.checkAlerts()
        this.validateSystemHealth()
      }, 1000) // Update every second
    }
  }
  
  private updateMetrics() {
    const timestamp = Date.now()
    
    // Collect core metrics
    const coreMetrics = this.collectCoreMetrics()
    
    // Collect safety metrics
    const safetyMetrics = this.collectSafetyMetrics()
    
    // Collect advanced metrics
    const advancedMetrics = this.collectAdvancedMetrics()
    
    const metrics: PerformanceMetrics = {
      core: coreMetrics,
      safety: safetyMetrics,
      advanced: advancedMetrics,
      timestamp
    }
    
    this.metrics.set('current', metrics)
    
    // Update system metrics
    this.updateSystemMetrics('core', coreMetrics)
    this.updateSystemMetrics('safety', safetyMetrics)
    this.updateSystemMetrics('advanced', advancedMetrics)
  }
  
  private collectCoreMetrics() {
    return {
      fps: this.getCurrentFPS(),
      memoryUsage: this.getCurrentMemoryUsage(),
      latency: this.getCurrentLatency(),
      renderTime: this.getCurrentRenderTime(),
      cacheHitRate: this.getCacheHitRate()
    }
  }
  
  private collectSafetyMetrics() {
    return {
      violations: this.getViolationCount(),
      emergencyTriggers: this.getEmergencyTriggerCount(),
      rolloutProgress: this.getRolloutProgress(),
      systemHealth: this.getSystemHealth()
    }
  }
  
  private collectAdvancedMetrics() {
    return {
      predictionAccuracy: this.getPredictionAccuracy(),
      mlOptimizations: this.getMLOptimizationCount(),
      realTimeAlerts: this.getRealTimeAlertCount(),
      uxAdaptations: this.getUXAdaptationCount()
    }
  }
  
  private updateSystemMetrics(systemId: string, metrics: any) {
    const system = this.systems.get(systemId)
    if (system) {
      system.metrics = metrics
      system.lastUpdate = Date.now()
    }
  }
  
  private checkAlerts() {
    const currentMetrics = this.metrics.get('current')
    if (!currentMetrics) return
    
    // Check core alerts
    this.checkCoreAlerts(currentMetrics.core)
    
    // Check safety alerts
    this.checkSafetyAlerts(currentMetrics.safety)
    
    // Check advanced alerts
    this.checkAdvancedAlerts(currentMetrics.advanced)
  }
  
  private checkCoreAlerts(metrics: any) {
    if (metrics.fps < 30) {
      this.triggerAlert('core', 'critical', 'Low FPS detected', metrics.fps, 30)
    }
    
    if (metrics.memoryUsage > 150) {
      this.triggerAlert('core', 'high', 'High memory usage', metrics.memoryUsage, 150)
    }
    
    if (metrics.latency > 200) {
      this.triggerAlert('core', 'medium', 'High latency', metrics.latency, 200)
    }
  }
  
  private checkSafetyAlerts(metrics: any) {
    if (metrics.violations > 5) {
      this.triggerAlert('safety', 'high', 'Multiple budget violations', metrics.violations, 5)
    }
    
    if (metrics.emergencyTriggers > 0) {
      this.triggerAlert('safety', 'critical', 'Emergency system triggered', metrics.emergencyTriggers, 0)
    }
    
    if (metrics.systemHealth < 70) {
      this.triggerAlert('safety', 'medium', 'System health degraded', metrics.systemHealth, 70)
    }
  }
  
  private checkAdvancedAlerts(metrics: any) {
    if (metrics.predictionAccuracy < 0.6) {
      this.triggerAlert('advanced', 'medium', 'ML prediction accuracy low', metrics.predictionAccuracy, 0.6)
    }
    
    if (metrics.mlOptimizations > 20) {
      this.triggerAlert('advanced', 'low', 'High ML optimization rate', metrics.mlOptimizations, 20)
    }
  }
  
  private triggerAlert(component: 'core' | 'safety' | 'advanced', severity: 'low' | 'medium' | 'high' | 'critical', message: string, value: number, threshold: number) {
    const alertId = `${component}-${severity}-${Date.now()}`
    
    const alert: PerformanceAlert = {
      id: alertId,
      severity,
      component,
      message,
      value,
      threshold,
      timestamp: Date.now(),
      resolved: false
    }
    
    this.alerts.set(alertId, alert)
    
    // Update system alerts
    const system = this.systems.get(component)
    if (system) {
      system.alerts.push(alert)
    }
    
    console.warn(`🚨 Performance Alert [${component}/${severity}]: ${message}`)
  }
  
  private validateSystemHealth() {
    this.systems.forEach((system, id) => {
      const systemAlerts = system.alerts.filter(a => !a.resolved)
      const criticalAlerts = systemAlerts.filter(a => a.severity === 'critical')
      
      // Mark system as unhealthy if critical alerts exist
      system.healthy = criticalAlerts.length === 0
      
      // Mark system as disabled if too many alerts
      if (systemAlerts.length > 10) {
        system.enabled = false
        console.warn(`🔴 System ${id} disabled due to too many alerts`)
      }
    })
  }
  
  // Public API
  getConfig(): PerformanceConfig {
    return { ...this.config }
  }
  
  updateConfig(newConfig: Partial<PerformanceConfig>) {
    this.config = {
      core: { ...this.config.core, ...newConfig.core },
      safety: { ...this.config.safety, ...newConfig.safety },
      advanced: { ...this.config.advanced, ...newConfig.advanced }
    }
    
    // Reinitialize systems with new config
    this.initializeSystems()
  }
  
  getMetrics(): PerformanceMetrics | undefined {
    return this.metrics.get('current')
  }
  
  getSystem(id: string): PerformanceSystem | undefined {
    return this.systems.get(id)
  }
  
  getAllSystems(): Map<string, PerformanceSystem> {
    return new Map(this.systems)
  }
  
  getAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
  }
  
  resolveAlert(alertId: string) {
    const alert = this.alerts.get(alertId)
    if (alert) {
      alert.resolved = true
      
      // Remove from system alerts
      this.systems.forEach((system: PerformanceSystem) => {
        system.alerts = system.alerts.filter((a: PerformanceAlert) => a.id !== alertId)
      })
    }
  }
  
  enableSystem(systemId: 'core' | 'safety' | 'advanced') {
    const system = this.systems.get(systemId)
    if (system) {
      system.enabled = true
      system.healthy = true
      console.log(`✅ Performance system ${systemId} enabled`)
    }
  }
  
  disableSystem(systemId: 'core' | 'safety' | 'advanced') {
    const system = this.systems.get(systemId)
    if (system) {
      system.enabled = false
      console.log(`🔴 Performance system ${systemId} disabled`)
    }
  }
  
  isEnabled(systemId: string): boolean {
    switch (systemId) {
      case 'core':
        return Object.values(this.config.core).some(enabled => enabled)
      case 'safety':
        return Object.values(this.config.safety).some(enabled => enabled)
      case 'advanced':
        return Object.values(this.config.advanced).some(enabled => enabled)
      default:
        return false
    }
  }
  
  // Metric collection methods (simplified implementations)
  private getCurrentFPS(): number {
    return 60 - Math.random() * 10
  }
  
  private getCurrentMemoryUsage(): number {
    return (performance as any).memory ? 
      Math.round((performance as any).memory.usedJSHeapSize / 1048576) : 
      50 + Math.random() * 20
  }
  
  private getCurrentLatency(): number {
    return 20 + Math.random() * 30
  }
  
  private getCurrentRenderTime(): number {
    return 10 + Math.random() * 15
  }
  
  private getCacheHitRate(): number {
    return 80 + Math.random() * 15
  }
  
  private getViolationCount(): number {
    return Math.floor(Math.random() * 3)
  }
  
  private getEmergencyTriggerCount(): number {
    return Math.random() > 0.9 ? 1 : 0
  }
  
  private getRolloutProgress(): number {
    return Math.random() * 100
  }
  
  private getSystemHealth(): number {
    return 85 + Math.random() * 10
  }
  
  private getPredictionAccuracy(): number {
    return 0.8 + Math.random() * 0.15
  }
  
  private getMLOptimizationCount(): number {
    return Math.floor(Math.random() * 10)
  }
  
  private getRealTimeAlertCount(): number {
    return Math.floor(Math.random() * 5)
  }
  
  private getUXAdaptationCount(): number {
    return Math.floor(Math.random() * 8)
  }
  
  cleanup() {
    if (this.updateInterval && typeof window !== 'undefined') {
      window.clearInterval(this.updateInterval)
    }
    
    this.metrics.clear()
    this.alerts.clear()
    this.systems.clear()
  }
}

// Global performance manager instance
export const performanceManager = new PerformanceManager()

// Reactive hook for performance management
export function usePerformanceManager() {
  const [config, setConfig] = createSignal<PerformanceConfig>(performanceManager.getConfig())
  const [metrics, setMetrics] = createSignal<PerformanceMetrics | undefined>(performanceManager.getMetrics())
  const [systems, setSystems] = createSignal<Map<string, PerformanceSystem>>(performanceManager.getAllSystems())
  const [alerts, setAlerts] = createSignal<PerformanceAlert[]>(performanceManager.getAlerts())
  
  createEffect(() => {
    if (typeof window !== 'undefined') {
      const interval = window.setInterval(() => {
        setMetrics(performanceManager.getMetrics())
        setSystems(performanceManager.getAllSystems())
        setAlerts(performanceManager.getAlerts())
      }, 1000) // Update every second
      
      onCleanup(() => window.clearInterval(interval))
    }
  })
  
  return {
    config,
    metrics,
    systems,
    alerts,
    updateConfig: (newConfig: Partial<PerformanceConfig>) => performanceManager.updateConfig(newConfig),
    enableSystem: (systemId: 'core' | 'safety' | 'advanced') => performanceManager.enableSystem(systemId),
    disableSystem: (systemId: 'core' | 'safety' | 'advanced') => performanceManager.disableSystem(systemId),
    resolveAlert: (alertId: string) => performanceManager.resolveAlert(alertId)
  }
}
