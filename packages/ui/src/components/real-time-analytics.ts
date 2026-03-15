import { createSignal, createEffect, onCleanup } from "solid-js"
import { useProductionAnalytics } from "./production-analytics"

// Real-Time Performance Analytics for Phase 3
export class RealTimeAnalytics {
  private metrics = new Map<string, RealTimeMetric>()
  private predictions = new Map<string, PerformancePrediction>()
  private alerts = new Map<string, RealTimeAlert>()
  private trends = new Map<string, TrendData>()
  private forecasting = new PerformanceForecasting()
  
  constructor() {
    this.startRealTimeCollection()
    this.startPredictionEngine()
    this.startTrendAnalysis()
    this.startForecastingEngine()
  }
  
  private startRealTimeCollection() {
    // Collect metrics every 100ms for real-time data
    setInterval(() => {
      this.collectRealTimeMetrics()
    }, 100)
  }
  
  private startPredictionEngine() {
    // Generate predictions every 1 second
    setInterval(() => {
      this.generatePredictions()
    }, 1000)
  }
  
  private startTrendAnalysis() {
    // Analyze trends every 5 seconds
    setInterval(() => {
      this.analyzeTrends()
    }, 5000)
  }
  
  private startForecastingEngine() {
    // Update forecasts every 10 seconds
    setInterval(() => {
      this.updateForecasts()
    }, 10000)
  }
  
  private collectRealTimeMetrics() {
    const timestamp = Date.now()
    
    // Collect core performance metrics
    const metrics = {
      fps: this.getCurrentFPS(),
      memoryUsage: this.getCurrentMemoryUsage(),
      latency: this.getCurrentLatency(),
      renderTime: this.getCurrentRenderTime(),
      cpuUsage: this.getCurrentCPUUsage(),
      networkSpeed: this.getCurrentNetworkSpeed(),
      batteryLevel: this.getCurrentBatteryLevel(),
      thermalState: this.getCurrentThermalState(),
      userInteractions: this.getCurrentUserInteractions(),
      errorRate: this.getCurrentErrorRate(),
      timestamp
    }
    
    // Store metrics
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number') {
        this.updateMetric(key, value, timestamp)
      }
    })
  }
  
  private updateMetric(name: string, value: number, timestamp: number) {
    let metric = this.metrics.get(name)
    
    if (!metric) {
      metric = {
        name,
        current: value,
        history: [],
        min: value,
        max: value,
        avg: value,
        trend: 'stable',
        lastUpdate: timestamp
      }
      this.metrics.set(name, metric)
    }
    
    // Update current value
    metric.current = value
    metric.lastUpdate = timestamp
    
    // Update history (keep last 1000 points)
    metric.history.push(value)
    if (metric.history.length > 1000) {
      metric.history.shift()
    }
    
    // Update min/max
    metric.min = Math.min(metric.min, value)
    metric.max = Math.max(metric.max, value)
    
    // Update average
    metric.avg = metric.history.reduce((sum, val) => sum + val, 0) / metric.history.length
    
    // Update trend
    metric.trend = this.calculateTrend(metric.history)
  }
  
  private calculateTrend(history: number[]): 'up' | 'down' | 'stable' | 'volatile' {
    if (history.length < 10) return 'stable'
    
    const recent = history.slice(-10)
    const older = history.slice(-20, -10)
    
    if (older.length === 0) return 'stable'
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length
    
    const change = (recentAvg - olderAvg) / olderAvg
    const volatility = this.calculateVolatility(recent)
    
    if (volatility > 0.3) return 'volatile'
    if (Math.abs(change) < 0.05) return 'stable'
    return change > 0 ? 'up' : 'down'
  }
  
  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    
    return Math.sqrt(variance) / mean
  }
  
  private generatePredictions() {
    // Generate predictions for each metric
    this.metrics.forEach((metric, name) => {
      const prediction = this.forecasting.predictNextValue(metric.history, name)
      this.predictions.set(name, prediction)
    })
  }
  
  private analyzeTrends() {
    // Analyze trends for each metric
    this.metrics.forEach((metric, name) => {
      const trend = this.analyzeMetricTrend(metric)
      this.trends.set(name, trend)
    })
  }
  
  private analyzeMetricTrend(metric: RealTimeMetric): TrendData {
    const history = metric.history
    if (history.length < 20) {
      return {
        direction: 'stable',
        strength: 0,
        duration: 0,
        confidence: 0,
        lastChange: 0
      }
    }
    
    // Calculate trend direction and strength
    const recent = history.slice(-10)
    const older = history.slice(-20, -10)
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length
    
    const change = (recentAvg - olderAvg) / olderAvg
    const direction = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'stable'
    const strength = Math.abs(change)
    
    // Calculate trend duration
    let duration = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (i === 0) break
      const prev = history[i - 1]
      const curr = history[i]
      const localChange = (curr - prev) / prev
      
      if ((direction === 'up' && localChange > 0) || 
          (direction === 'down' && localChange < 0) ||
          (direction === 'stable' && Math.abs(localChange) < 0.05)) {
        duration++
      } else {
        break
      }
    }
    
    // Calculate confidence
    const confidence = Math.min(1, duration / 10)
    
    return {
      direction,
      strength,
      duration,
      confidence,
      lastChange: Date.now()
    }
  }
  
  private updateForecasts() {
    // Update forecasts for next 5 minutes
    this.metrics.forEach((metric, name) => {
      const forecast = this.forecasting.generateForecast(metric.history, name)
      this.predictions.set(`${name}_forecast`, forecast)
    })
  }
  
  // Metric collection methods
  private getCurrentFPS(): number {
    // Simulate FPS measurement
    return 60 - Math.random() * 10
  }
  
  private getCurrentMemoryUsage(): number {
    // Simulate memory usage
    return (performance as any).memory ? 
      Math.round((performance as any).memory.usedJSHeapSize / 1048576) : 
      50 + Math.random() * 20
  }
  
  private getCurrentLatency(): number {
    // Simulate latency measurement
    return 20 + Math.random() * 30
  }
  
  private getCurrentRenderTime(): number {
    // Simulate render time
    return 10 + Math.random() * 15
  }
  
  private getCurrentCPUUsage(): number {
    // Simulate CPU usage
    return 30 + Math.random() * 40
  }
  
  private getCurrentNetworkSpeed(): number {
    // Simulate network speed
    return 10 + Math.random() * 20
  }
  
  private getCurrentBatteryLevel(): number {
    // Simulate battery level
    return (navigator as any).battery?.level * 100 || 80 + Math.random() * 20
  }
  
  private getCurrentThermalState(): string {
    // Simulate thermal state
    const states = ['normal', 'warm', 'hot']
    return states[Math.floor(Math.random() * states.length)]
  }
  
  private getCurrentUserInteractions(): number {
    // Simulate user interactions
    return Math.floor(Math.random() * 10)
  }
  
  private getCurrentErrorRate(): number {
    // Simulate error rate
    return Math.random() * 5
  }
  
  // Public API
  getRealTimeMetrics(): Map<string, RealTimeMetric> {
    return new Map(this.metrics)
  }
  
  getMetric(name: string): RealTimeMetric | undefined {
    return this.metrics.get(name)
  }
  
  getPredictions(): Map<string, PerformancePrediction> {
    return new Map(this.predictions)
  }
  
  getPrediction(name: string): PerformancePrediction | undefined {
    return this.predictions.get(name)
  }
  
  getTrends(): Map<string, TrendData> {
    return new Map(this.trends)
  }
  
  getTrend(name: string): TrendData | undefined {
    return this.trends.get(name)
  }
  
  getAlerts(): RealTimeAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp - a.timestamp)
  }
  
  getSystemHealth(): RealTimeSystemHealth {
    const metrics = Array.from(this.metrics.values())
    const alerts = this.getAlerts()
    
    // Calculate health score
    let healthScore = 100
    
    // Deduct points for alerts
    healthScore -= alerts.filter(a => a.severity === 'critical').length * 25
    healthScore -= alerts.filter(a => a.severity === 'warning').length * 15
    healthScore -= alerts.filter(a => a.severity === 'info').length * 10
    
    // Deduct points for poor metrics
    const fps = this.metrics.get('fps')
    if (fps && fps.current < 55) healthScore -= 20
    
    const memory = this.metrics.get('memoryUsage')
    if (memory && memory.current > 100) healthScore -= 15
    
    const latency = this.metrics.get('latency')
    if (latency && latency.current > 100) healthScore -= 10
    
    healthScore = Math.max(0, healthScore)
    
    let status: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent'
    if (healthScore < 50) status = 'critical'
    else if (healthScore < 70) status = 'warning'
    else if (healthScore < 85) status = 'good'
    
    return {
      score: healthScore,
      status,
      metrics: metrics.length,
      alerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      lastUpdate: Date.now()
    }
  }
  
  getPerformanceForecast(): PerformanceForecast {
    const forecasts = new Map<string, number[]>()
    
    // Get forecasts for key metrics
    const keyMetrics: string[] = ['fps', 'memoryUsage', 'latency', 'renderTime']
    keyMetrics.forEach((metric: string) => {
      const prediction = this.predictions.get(`${metric}_forecast`)
      if (prediction && prediction.values) {
        forecasts.set(metric, prediction.values)
      }
    })
    
    return {
      timeHorizon: 300000, // 5 minutes
      forecasts,
      confidence: this.calculateForecastConfidence(),
      generatedAt: Date.now()
    }
  }
  
  private calculateForecastConfidence(): number {
    const forecasts = Array.from(this.predictions.values())
    if (forecasts.length === 0) return 0.5
    
    const avgConfidence = forecasts.reduce((sum, f) => sum + f.confidence, 0) / forecasts.length
    return avgConfidence
  }
  
  // Alert management
  checkAlerts() {
    this.metrics.forEach((metric, name) => {
      this.checkMetricAlerts(name, metric)
    })
  }
  
  private checkMetricAlerts(name: string, metric: RealTimeMetric) {
    const thresholds = this.getAlertThresholds(name)
    if (!thresholds) return
    
    // Check for threshold violations
    if (metric.current > thresholds.critical) {
      this.triggerAlert(name, 'critical', metric.current, thresholds.critical)
    } else if (metric.current > thresholds.warning) {
      this.triggerAlert(name, 'warning', metric.current, thresholds.warning)
    } else if (metric.current > thresholds.info) {
      this.triggerAlert(name, 'info', metric.current, thresholds.info)
    }
  }
  
  private getAlertThresholds(name: string): AlertThresholds | undefined {
    const thresholds: Record<string, AlertThresholds> = {
      fps: { critical: 30, warning: 45, info: 55 },
      memoryUsage: { critical: 150, warning: 120, info: 100 },
      latency: { critical: 200, warning: 150, info: 100 },
      renderTime: { critical: 30, warning: 20, info: 15 },
      cpuUsage: { critical: 90, warning: 75, info: 60 },
      errorRate: { critical: 10, warning: 5, info: 2 }
    }
    
    return thresholds[name]
  }
  
  private triggerAlert(metric: string, severity: 'critical' | 'warning' | 'info', value: number, threshold: number) {
    const alertId = `${metric}-${severity}-${Date.now()}`
    
    // Check if similar alert already exists
    const existingAlert = Array.from(this.alerts.values())
      .find(a => a.metric === metric && a.severity === severity && !a.resolved)
    
    if (existingAlert) return
    
    const alert: RealTimeAlert = {
      id: alertId,
      metric,
      severity,
      value,
      threshold,
      message: `${metric} ${severity}: ${value} (threshold: ${threshold})`,
      timestamp: Date.now(),
      resolved: false
    }
    
    this.alerts.set(alertId, alert)
    
    console.warn(`🚨 REAL-TIME ALERT: ${alert.message}`)
  }
  
  resolveAlert(alertId: string) {
    const alert = this.alerts.get(alertId)
    if (alert) {
      alert.resolved = true
      alert.resolvedAt = Date.now()
    }
  }
  
  cleanup() {
    this.metrics.clear()
    this.predictions.clear()
    this.alerts.clear()
    this.trends.clear()
  }
}

// Performance Forecasting Engine
class PerformanceForecasting {
  predictNextValue(history: number[], metricName: string): PerformancePrediction {
    if (history.length < 10) {
      return {
        metric: metricName,
        predicted: history[history.length - 1] || 0,
        confidence: 0.1,
        method: 'insufficient_data',
        timestamp: Date.now()
      }
    }
    
    // Use simple linear regression for prediction
    const prediction = this.linearRegression(history)
    
    return {
      metric: metricName,
      predicted: prediction.value,
      confidence: prediction.confidence,
      method: 'linear_regression',
      timestamp: Date.now()
    }
  }
  
  generateForecast(history: number[], metricName: string): PerformancePrediction {
    const prediction = this.predictNextValue(history, metricName)
    
    // Generate forecast for next 5 minutes
    const values = []
    let currentValue = prediction.predicted
    
    for (let i = 0; i < 30; i++) { // 30 points for 5 minutes
      currentValue += (Math.random() - 0.5) * 2 // Add some randomness
      values.push(currentValue)
    }
    
    return {
      metric: metricName,
      predicted: values[0],
      confidence: prediction.confidence * 0.8, // Lower confidence for longer forecasts
      method: 'linear_regression_extended',
      timestamp: Date.now(),
      values
    }
  }
  
  private linearRegression(data: number[]): { value: number; confidence: number } {
    const n = data.length
    if (n < 2) return { value: data[0] || 0, confidence: 0 }
    
    const sumX = data.reduce((sum, _, i) => sum + i, 0)
    const sumY = data.reduce((sum, val) => sum + val, 0)
    const sumXY = data.reduce((sum, val, i) => sum + i * val, 0)
    const sumXX = data.reduce((sum, _, i) => sum + i * i, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // Predict next value
    const nextX = n
    const predicted = slope * nextX + intercept
    
    // Calculate confidence based on R²
    const meanY = sumY / n
    const ssTotal = data.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0)
    const ssResidual = data.reduce((sum, val, i) => {
      const predictedY = slope * i + intercept
      return sum + Math.pow(val - predictedY, 2)
    }, 0)
    
    const rSquared = 1 - (ssResidual / ssTotal)
    const confidence = Math.max(0, Math.min(1, rSquared))
    
    return { value: predicted, confidence }
  }
}

// Interfaces
interface RealTimeMetric {
  name: string
  current: number
  history: number[]
  min: number
  max: number
  avg: number
  trend: 'up' | 'down' | 'stable' | 'volatile'
  lastUpdate: number
}

interface PerformancePrediction {
  metric: string
  predicted: number
  confidence: number
  method: string
  timestamp: number
  values?: number[]
}

interface TrendData {
  direction: 'up' | 'down' | 'stable'
  strength: number
  duration: number
  confidence: number
  lastChange: number
}

interface RealTimeAlert {
  id: string
  metric: string
  severity: 'critical' | 'warning' | 'info'
  value: number
  threshold: number
  message: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
}

interface AlertThresholds {
  critical: number
  warning: number
  info: number
}

interface RealTimeSystemHealth {
  score: number
  status: 'excellent' | 'good' | 'warning' | 'critical'
  metrics: number
  alerts: number
  criticalAlerts: number
  lastUpdate: number
}

interface PerformanceForecast {
  timeHorizon: number
  forecasts: Map<string, number[]>
  confidence: number
  generatedAt: number
}

// Global real-time analytics instance
export const realTimeAnalytics = new RealTimeAnalytics()

// Reactive hook for real-time analytics
export function useRealTimeAnalytics() {
  const [metrics, setMetrics] = createSignal<Map<string, RealTimeMetric>>(realTimeAnalytics.getRealTimeMetrics())
  const [alerts, setAlerts] = createSignal<RealTimeAlert[]>(realTimeAnalytics.getAlerts())
  const [health, setHealth] = createSignal<RealTimeSystemHealth>(realTimeAnalytics.getSystemHealth())
  const [forecast, setForecast] = createSignal<PerformanceForecast>(realTimeAnalytics.getPerformanceForecast())
  
  createEffect(() => {
    const interval = window.setInterval(() => {
      setMetrics(realTimeAnalytics.getRealTimeMetrics())
      setAlerts(realTimeAnalytics.getAlerts())
      setHealth(realTimeAnalytics.getSystemHealth())
      setForecast(realTimeAnalytics.getPerformanceForecast())
    }, 1000) // Update every second
    
    onCleanup(() => window.clearInterval(interval))
  })
  
  return {
    metrics,
    alerts,
    health,
    forecast,
    getMetric: (name: string) => realTimeAnalytics.getMetric(name),
    getPrediction: (name: string) => realTimeAnalytics.getPrediction(name),
    getTrend: (name: string) => realTimeAnalytics.getTrend(name),
    resolveAlert: (alertId: string) => realTimeAnalytics.resolveAlert(alertId)
  }
}
