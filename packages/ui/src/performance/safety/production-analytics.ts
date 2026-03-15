import { createSignal, createEffect, onCleanup } from "solid-js"

// Production Analytics System for Phase 2
export class ProductionAnalytics {
  private metrics = new Map<string, AnalyticsMetric>()
  private alerts = new Map<string, Alert>()
  private startTime = Date.now()
  
  recordMetric(name: string, value: number, tags?: Record<string, string>) {
    const metric: AnalyticsMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags: tags || {},
      history: this.metrics.get(name)?.history || []
    }
    
    metric.history.push(value)
    if (metric.history.length > 100) {
      metric.history.shift()
    }
    
    this.metrics.set(name, metric)
  }
  
  getMetric(name: string): AnalyticsMetric | undefined {
    return this.metrics.get(name)
  }
  
  getAllMetrics(): Map<string, AnalyticsMetric> {
    return new Map(this.metrics)
  }
  
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved)
  }
  
  getSystemHealth(): SystemHealth {
    const activeAlerts = this.getActiveAlerts()
    const criticalAlerts = this.getAlertsBySeverity('critical')
    
    return {
      score: 100 - (criticalAlerts.length * 25) - (activeAlerts.length * 5),
      status: criticalAlerts.length > 0 ? 'critical' : activeAlerts.length > 0 ? 'warning' : 'healthy',
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      uptime: Date.now() - this.startTime
    }
  }
  
  getUserAnalytics(): UserAnalytics {
    return {
      totalUsers: 0,
      activeUsers: 0,
      averageSessionTime: 0,
      bounceRate: 0,
      topActions: []
    }
  }
  
  private getAlertsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): Alert[] {
    return this.getActiveAlerts().filter(alert => alert.severity === severity)
  }
}

interface AnalyticsMetric {
  name: string
  value: number
  timestamp: number
  tags: Record<string, string>
  history: number[]
}

interface Alert {
  id: string
  metric: string
  value: number
  threshold: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: number
  resolved: boolean
}

interface SystemHealth {
  score: number
  status: 'healthy' | 'warning' | 'critical'
  activeAlerts: number
  criticalAlerts: number
  uptime: number
}

interface UserAnalytics {
  totalUsers: number
  activeUsers: number
  averageSessionTime: number
  bounceRate: number
  topActions: { action: string; count: number }[]
}

// Global production analytics instance
export const productionAnalytics = new ProductionAnalytics()

// Reactive hook for production analytics
export function useProductionAnalytics() {
  const [systemHealth, setSystemHealth] = createSignal<SystemHealth>(productionAnalytics.getSystemHealth())
  const [activeAlerts, setActiveAlerts] = createSignal<Alert[]>(productionAnalytics.getActiveAlerts())
  const [userAnalytics, setUserAnalytics] = createSignal<UserAnalytics>(productionAnalytics.getUserAnalytics())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setSystemHealth(productionAnalytics.getSystemHealth())
      setActiveAlerts(productionAnalytics.getActiveAlerts())
      setUserAnalytics(productionAnalytics.getUserAnalytics())
    }, 5000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    systemHealth,
    activeAlerts,
    userAnalytics,
    recordMetric: (name: string, value: number, tags?: Record<string, string>) => 
      productionAnalytics.recordMetric(name, value, tags),
    getMetric: (name: string) => productionAnalytics.getMetric(name)
  }
}
