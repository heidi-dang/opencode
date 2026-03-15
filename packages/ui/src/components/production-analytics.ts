import { createSignal, createEffect, onCleanup } from "solid-js"
import { usePerformanceMetrics } from "../features/performance-flags"

// Production Analytics System for Phase 2
export class ProductionAnalytics {
  private metrics = new Map<string, AnalyticsMetric>()
  private alerts = new Map<string, Alert>()
  private startTime = Date.now()
  private alertThresholds = {
    errorRate: 0.05, // 5%
    latency: 200, // 200ms
    memoryUsage: 150, // 150MB
    performanceScore: 70, // Below 70
    userSatisfaction: 3.5 // Below 3.5/5
  }
  
  recordMetric(name: string, value: number, tags?: Record<string, string>) {
    const metric: AnalyticsMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags: tags || {},
      history: this.metrics.get(name)?.history || []
    }
    
    // Keep only last 100 data points
    metric.history.push(value)
    if (metric.history.length > 100) {
      metric.history.shift()
    }
    
    this.metrics.set(name, metric)
    
    // Check for alerts
    this.checkAlerts(name, value)
  }
  
  private checkAlerts(metricName: string, value: number) {
    const threshold = this.alertThresholds[metricName as keyof typeof this.alertThresholds]
    
    if (threshold !== undefined && value > threshold) {
      this.triggerAlert(metricName, value, threshold)
    }
  }
  
  private triggerAlert(metricName: string, value: number, threshold: number) {
    const alertId = `${metricName}-${Date.now()}`
    const alert: Alert = {
      id: alertId,
      metric: metricName,
      value,
      threshold,
      severity: this.getSeverity(metricName, value, threshold),
      message: `${metricName} exceeded threshold: ${value} > ${threshold}`,
      timestamp: Date.now(),
      resolved: false
    }
    
    this.alerts.set(alertId, alert)
    
    console.warn(`🚨 ALERT: ${alert.message}`)
    
    // Store alert for dashboard
    this.storeAlert(alert)
  }
  
  private getSeverity(metricName: string, value: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = value / threshold
    
    if (ratio >= 2) return 'critical'
    if (ratio >= 1.5) return 'high'
    if (ratio >= 1.2) return 'medium'
    return 'low'
  }
  
  private storeAlert(alert: Alert) {
    if (typeof window !== 'undefined') {
      const alerts = JSON.parse(localStorage.getItem('production-alerts') || '[]')
      alerts.push(alert)
      
      // Keep only last 50 alerts
      if (alerts.length > 50) {
        alerts.shift()
      }
      
      localStorage.setItem('production-alerts', JSON.stringify(alerts))
    }
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
  
  getAlertsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): Alert[] {
    return this.getActiveAlerts().filter(alert => alert.severity === severity)
  }
  
  resolveAlert(alertId: string) {
    const alert = this.alerts.get(alertId)
    if (alert) {
      alert.resolved = true
      alert.resolvedAt = Date.now()
      this.alerts.set(alertId, alert)
    }
  }
  
  // Analytics calculations
  calculateAverage(metricName: string, period?: number): number {
    const metric = this.metrics.get(metricName)
    if (!metric || metric.history.length === 0) return 0
    
    const cutoff = period ? Date.now() - period : 0
    const relevantHistory = metric.history.filter((_, index) => {
      const timestamp = metric.timestamp - (metric.history.length - index - 1) * 1000
      return timestamp >= cutoff
    })
    
    return relevantHistory.reduce((sum, val) => sum + val, 0) / relevantHistory.length
  }
  
  calculateTrend(metricName: string, period: number = 3600000): 'up' | 'down' | 'stable' {
    const metric = this.metrics.get(metricName)
    if (!metric || metric.history.length < 2) return 'stable'
    
    const cutoff = Date.now() - period
    const recent = metric.history.slice(-10)
    const older = metric.history.slice(-20, -10)
    
    if (older.length === 0) return 'stable'
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length
    
    const change = (recentAvg - olderAvg) / olderAvg
    
    if (Math.abs(change) < 0.05) return 'stable'
    return change > 0 ? 'up' : 'down'
  }
  
  getSystemHealth(): SystemHealth {
    const activeAlerts = this.getActiveAlerts()
    const criticalAlerts = this.getAlertsBySeverity('critical')
    const highAlerts = this.getAlertsBySeverity('high')
    
    let healthScore = 100
    
    // Deduct points for alerts
    healthScore -= criticalAlerts.length * 25
    healthScore -= highAlerts.length * 10
    healthScore -= this.getAlertsBySeverity('medium').length * 5
    healthScore -= this.getAlertsBySeverity('low').length * 2
    
    healthScore = Math.max(0, healthScore)
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (healthScore < 50) status = 'critical'
    else if (healthScore < 80) status = 'warning'
    
    return {
      score: healthScore,
      status,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      uptime: Date.now() - this.startTime,
      lastUpdate: Date.now()
    }
  }
  
  // User behavior analytics
  trackUserAction(action: string, userId?: string, metadata?: Record<string, any>) {
    const event: UserEvent = {
      type: 'user_action',
      action,
      userId: userId || 'anonymous',
      timestamp: Date.now(),
      metadata: metadata || {}
    }
    
    this.recordUserEvent(event)
  }
  
  trackPerformanceEvent(event: string, value: number, context?: Record<string, any>) {
    const performanceEvent: PerformanceEvent = {
      type: 'performance',
      event,
      value,
      timestamp: Date.now(),
      context: context || {}
    }
    
    this.recordPerformanceEvent(performanceEvent)
  }
  
  private recordUserEvent(event: UserEvent) {
    if (typeof window !== 'undefined') {
      const events = JSON.parse(localStorage.getItem('user-events') || '[]')
      events.push(event)
      
      // Keep only last 1000 events
      if (events.length > 1000) {
        events.shift()
      }
      
      localStorage.setItem('user-events', JSON.stringify(events))
    }
  }
  
  private recordPerformanceEvent(event: PerformanceEvent) {
    if (typeof window !== 'undefined') {
      const events = JSON.parse(localStorage.getItem('performance-events') || '[]')
      events.push(event)
      
      // Keep only last 500 events
      if (events.length > 500) {
        events.shift()
      }
      
      localStorage.setItem('performance-events', JSON.stringify(events))
    }
  }
  
  getUserAnalytics(): UserAnalytics {
    if (typeof window === 'undefined') {
      return {
        totalUsers: 0,
        activeUsers: 0,
        averageSessionTime: 0,
        bounceRate: 0,
        topActions: []
      }
    }
    
    const events = JSON.parse(localStorage.getItem('user-events') || '[]')
    const userEvents = events.filter((e: UserEvent) => e.type === 'user_action')
    
    const uniqueUsers = new Set(userEvents.map((e: UserEvent) => e.userId))
    const recentEvents = userEvents.filter((e: UserEvent) => Date.now() - e.timestamp < 300000) // Last 5 minutes
    
    // Calculate top actions
    const actionCounts = new Map<string, number>()
    userEvents.forEach((e: UserEvent) => {
      actionCounts.set(e.action, (actionCounts.get(e.action) || 0) + 1)
    })
    
    const topActions = Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }))
    
    return {
      totalUsers: uniqueUsers.size,
      activeUsers: new Set(recentEvents.map((e: UserEvent) => e.userId)).size,
      averageSessionTime: 0, // Would need session tracking
      bounceRate: 0, // Would need session tracking
      topActions
    }
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
  resolvedAt?: number
}

interface SystemHealth {
  score: number
  status: 'healthy' | 'warning' | 'critical'
  activeAlerts: number
  criticalAlerts: number
  uptime: number
  lastUpdate: number
}

interface UserEvent {
  type: 'user_action'
  action: string
  userId: string
  timestamp: number
  metadata: Record<string, any>
}

interface PerformanceEvent {
  type: 'performance'
  event: string
  value: number
  timestamp: number
  context: Record<string, any>
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
    }, 5000) // Update every 5 seconds
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    systemHealth,
    activeAlerts,
    userAnalytics,
    recordMetric: (name: string, value: number, tags?: Record<string, string>) => 
      productionAnalytics.recordMetric(name, value, tags),
    trackUserAction: (action: string, userId?: string, metadata?: Record<string, any>) =>
      productionAnalytics.trackUserAction(action, userId, metadata),
    trackPerformanceEvent: (event: string, value: number, context?: Record<string, any>) =>
      productionAnalytics.trackPerformanceEvent(event, value, context),
    resolveAlert: (alertId: string) => productionAnalytics.resolveAlert(alertId),
    getMetric: (name: string) => productionAnalytics.getMetric(name),
    calculateAverage: (name: string, period?: number) => productionAnalytics.calculateAverage(name, period),
    calculateTrend: (name: string, period?: number) => productionAnalytics.calculateTrend(name, period)
  }
}
