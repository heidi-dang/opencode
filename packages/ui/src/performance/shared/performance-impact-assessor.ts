import { createSignal, createEffect, onCleanup } from "solid-js"
import { performanceManager } from "../manager"
import { featureFlagManager } from "./feature-flags"

// Performance Impact Assessor for Phase C
export class PerformanceImpactAssessor {
  private baselineMetrics = new Map<string, BaselineMetric>()
  private impactHistory = new Map<string, ImpactMeasurement>()
  private assessmentResults = new Map<string, AssessmentResult>()
  public isAssessing = false
  private assessmentInterval: number | undefined
  
  constructor() {
    this.captureBaseline()
  }
  
  private captureBaseline(): void {
    console.log('📊 Capturing performance baseline...')
    
    const timestamp = Date.now()
    const metrics = performanceManager.getMetrics()
    
    if (!metrics) {
      console.warn('⚠️ No metrics available for baseline capture')
      return
    }
    
    // Capture baseline for all core metrics
    this.baselineMetrics.set('fps', {
      name: 'FPS',
      baseline: metrics.core.fps,
      timestamp,
      variance: 0,
      samples: [metrics.core.fps]
    })
    
    this.baselineMetrics.set('memoryUsage', {
      name: 'Memory Usage',
      baseline: metrics.core.memoryUsage,
      timestamp,
      variance: 0,
      samples: [metrics.core.memoryUsage]
    })
    
    this.baselineMetrics.set('latency', {
      name: 'Latency',
      baseline: metrics.core.latency,
      timestamp,
      variance: 0,
      samples: [metrics.core.latency]
    })
    
    this.baselineMetrics.set('renderTime', {
      name: 'Render Time',
      baseline: metrics.core.renderTime,
      timestamp,
      variance: 0,
      samples: [metrics.core.renderTime]
    })
    
    console.log('✅ Performance baseline captured')
  }
  
  async assessPerformanceImpact(phase: 'core' | 'safety' | 'advanced'): Promise<ImpactAssessment> {
    if (this.isAssessing) {
      throw new Error('Performance impact assessment already in progress')
    }
    
    this.isAssessing = true
    console.log(`📊 Assessing performance impact for phase: ${phase}`)
    
    const startTime = Date.now()
    const assessment: ImpactAssessment = {
      phase,
      overallImpact: 'none',
      metrics: {},
      recommendations: [],
      duration: 0,
      confidence: 0
    }
    
    try {
      // Enable the phase for assessment
      const wasEnabled = this.isPhaseEnabled(phase)
      if (!wasEnabled) {
        await this.enablePhase(phase)
      }
      
      // Wait for systems to stabilize
      await this.wait(5000)
      
      // Collect impact measurements
      const measurements = await this.collectImpactMeasurements(phase)
      assessment.metrics = measurements
      
      // Analyze impact for each metric
      let totalImpact = 0
      let metricCount = 0
      
      for (const [metricId, measurement] of Object.entries(measurements)) {
        const impact = this.analyzeImpact(metricId, measurement)
        measurement.impact = impact.impact
        measurement.impactPercentage = impact.percentage
        measurement.significance = impact.significance
        
        totalImpact += impact.percentage
        metricCount++
      }
      
      // Calculate overall impact
      const avgImpact = metricCount > 0 ? totalImpact / metricCount : 0
      assessment.overallImpact = this.categorizeImpact(avgImpact)
      assessment.confidence = this.calculateConfidence(measurements)
      
      // Generate recommendations
      assessment.recommendations = this.generateImpactRecommendations(assessment.metrics, assessment.overallImpact)
      
      assessment.duration = Date.now() - startTime
      
      // Store assessment result
      this.assessmentResults.set(`${phase}_${Date.now()}`, {
        phase,
        timestamp: Date.now(),
        overallImpact: assessment.overallImpact,
        metrics: assessment.metrics,
        recommendations: assessment.recommendations,
        confidence: assessment.confidence
      })
      
      // Rollback if we enabled the phase for assessment
      if (!wasEnabled) {
        await this.disablePhase(phase)
      }
      
      console.log(`✅ Performance impact assessment completed for ${phase}`)
      console.log(`📊 Overall impact: ${assessment.overallImpact} (${avgImpact.toFixed(1)}%)`)
      console.log(`🎯 Confidence: ${(assessment.confidence * 100).toFixed(1)}%`)
      
      return assessment
      
    } catch (error) {
      console.error(`❌ Performance impact assessment failed for ${phase}:`, error)
      assessment.overallImpact = 'critical'
      assessment.recommendations.push(`Assessment failed: ${error}`)
      assessment.duration = Date.now() - startTime
      return assessment
      
    } finally {
      this.isAssessing = false
    }
  }
  
  private async collectImpactMeasurements(phase: 'core' | 'safety' | 'advanced'): Promise<Record<string, ImpactMeasurement>> {
    const measurements: Record<string, ImpactMeasurement> = {}
    const sampleCount = 10
    const sampleInterval = 1000 // 1 second between samples
    
    // Collect samples for each baseline metric
    for (const [metricId, baseline] of this.baselineMetrics) {
      const samples: number[] = []
      
      for (let i = 0; i < sampleCount; i++) {
        const metrics = performanceManager.getMetrics()
        if (!metrics) {
          console.warn(`⚠️ No metrics available for sample ${i + 1}`)
          continue
        }
        
        let value = 0
        switch (metricId) {
          case 'fps':
            value = metrics.core.fps
            break
          case 'memoryUsage':
            value = metrics.core.memoryUsage
            break
          case 'latency':
            value = metrics.core.latency
            break
          case 'renderTime':
            value = metrics.core.renderTime
            break
        }
        
        samples.push(value)
        
        if (i < sampleCount - 1) {
          await this.wait(sampleInterval)
        }
      }
      
      // Calculate statistics
      const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length
      const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length
      const stdDev = Math.sqrt(variance)
      
      measurements[metricId] = {
        metricId,
        name: baseline.name,
        baseline: baseline.baseline,
        current: mean,
        samples,
        variance,
        standardDeviation: stdDev,
        impact: 'none',
        impactPercentage: 0,
        significance: 'insignificant'
      }
    }
    
    return measurements
  }
  
  private analyzeImpact(metricId: string, measurement: ImpactMeasurement): { impact: ImpactLevel; percentage: number; significance: SignificanceLevel } {
    const baseline = measurement.baseline
    const current = measurement.current
    
    // Calculate percentage change
    const percentageChange = baseline !== 0 ? ((current - baseline) / baseline) * 100 : 0
    
    // Determine impact level
    let impact: ImpactLevel = 'none'
    let significance: SignificanceLevel = 'insignificant'
    
    // Use different thresholds for different metrics
    switch (metricId) {
      case 'fps':
        if (percentageChange < -20) impact = 'critical'
        else if (percentageChange < -10) impact = 'high'
        else if (percentageChange < -5) impact = 'medium'
        else if (percentageChange < -2) impact = 'low'
        break
        
      case 'memoryUsage':
        if (percentageChange > 50) impact = 'critical'
        else if (percentageChange > 25) impact = 'high'
        else if (percentageChange > 15) impact = 'medium'
        else if (percentageChange > 5) impact = 'low'
        break
        
      case 'latency':
        if (percentageChange > 100) impact = 'critical'
        else if (percentageChange > 50) impact = 'high'
        else if (percentageChange > 25) impact = 'medium'
        else if (percentageChange > 10) impact = 'low'
        break
        
      case 'renderTime':
        if (percentageChange > 100) impact = 'critical'
        else if (percentageChange > 50) impact = 'high'
        else if (percentageChange > 25) impact = 'medium'
        else if (percentageChange > 10) impact = 'low'
        break
    }
    
    // Determine statistical significance
    const stdDevRatio = measurement.standardDeviation / baseline
    if (stdDevRatio > 0.5) significance = 'high'
    else if (stdDevRatio > 0.25) significance = 'medium'
    else if (stdDevRatio > 0.1) significance = 'low'
    
    return {
      impact,
      percentage: Math.abs(percentageChange),
      significance
    }
  }
  
  private categorizeImpact(avgPercentage: number): ImpactLevel {
    if (avgPercentage > 30) return 'critical'
    if (avgPercentage > 20) return 'high'
    if (avgPercentage > 10) return 'medium'
    if (avgPercentage > 5) return 'low'
    return 'none'
  }
  
  private calculateConfidence(measurements: Record<string, ImpactMeasurement>): number {
    const measurementValues = Object.values(measurements)
    
    if (measurementValues.length === 0) return 0
    
    // Calculate confidence based on sample size and consistency
    let totalConfidence = 0
    let count = 0
    
    measurementValues.forEach(measurement => {
      const sampleConfidence = Math.min(1, measurement.samples.length / 10) // 10 samples = full confidence
      const consistencyConfidence = 1 - (measurement.standardDeviation / measurement.baseline) // Less variance = higher confidence
      
      totalConfidence += (sampleConfidence + consistencyConfidence) / 2
      count++
    })
    
    return count > 0 ? totalConfidence / count : 0
  }
  
  private generateImpactRecommendations(measurements: Record<string, ImpactMeasurement>, overallImpact: ImpactLevel): string[] {
    const recommendations: string[] = []
    
    // Generate recommendations based on individual metrics
    Object.values(measurements).forEach(measurement => {
      if (measurement.impact === 'critical') {
        recommendations.push(`URGENT: ${measurement.name} shows critical impact (${measurement.impactPercentage.toFixed(1)}%)`)
      } else if (measurement.impact === 'high') {
        recommendations.push(`HIGH: ${measurement.name} shows high impact (${measurement.impactPercentage.toFixed(1)}%)`)
      } else if (measurement.impact === 'medium') {
        recommendations.push(`MEDIUM: ${measurement.name} shows medium impact (${measurement.impactPercentage.toFixed(1)}%)`)
      }
    })
    
    // Generate overall recommendations
    switch (overallImpact) {
      case 'critical':
        recommendations.push('CRITICAL: Consider immediate rollback due to severe performance impact')
        recommendations.push('Review and optimize the most affected metrics')
        break
        
      case 'high':
        recommendations.push('HIGH: Monitor closely and consider optimization')
        recommendations.push('Review configuration and resource allocation')
        break
        
      case 'medium':
        recommendations.push('MEDIUM: Acceptable but monitor for degradation')
        recommendations.push('Consider performance optimizations for better user experience')
        break
        
      case 'low':
        recommendations.push('LOW: Minimal impact, acceptable for production')
        recommendations.push('Continue monitoring for long-term trends')
        break
        
      case 'none':
        recommendations.push('NONE: No significant performance impact detected')
        recommendations.push('System is performing within expected parameters')
        break
    }
    
    return recommendations
  }
  
  private async enablePhase(phase: 'core' | 'safety' | 'advanced'): Promise<void> {
    featureFlagManager.enableIntegrationPhase(phase)
    await this.wait(2000) // Wait for systems to initialize
  }
  
  private async disablePhase(phase: 'core' | 'safety' | 'advanced'): Promise<void> {
    featureFlagManager.disableIntegrationPhase(phase)
    await this.wait(1000) // Wait for systems to shutdown
  }
  
  private isPhaseEnabled(phase: 'core' | 'safety' | 'advanced'): boolean {
    const status = featureFlagManager.getIntegrationStatus()
    return status[phase]
  }
  
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  // Continuous impact monitoring
  startContinuousMonitoring(): void {
    if (this.assessmentInterval) return
    
    console.log('📊 Starting continuous performance impact monitoring')
    
    if (typeof window !== 'undefined') {
      this.assessmentInterval = window.setInterval(async () => {
        try {
          const status = featureFlagManager.getIntegrationStatus()
          
          // Assess each enabled phase
          for (const phase of ['core', 'safety', 'advanced'] as const) {
            if (status[phase]) {
              const assessment = await this.assessPerformanceImpact(phase)
              
              // Log if significant impact detected
              if (assessment.overallImpact === 'critical' || assessment.overallImpact === 'high') {
                console.warn(`⚠️ Significant performance impact detected in ${phase}: ${assessment.overallImpact}`)
                assessment.recommendations.forEach(rec => console.warn(`  - ${rec}`))
              }
            }
          }
        } catch (error) {
          console.error('❌ Continuous impact monitoring error:', error)
        }
      }, 60000) // Check every minute
    }
  }
  
  stopContinuousMonitoring(): void {
    if (this.assessmentInterval && typeof window !== 'undefined') {
      window.clearInterval(this.assessmentInterval)
      this.assessmentInterval = undefined
      console.log('⏹️ Stopped continuous performance impact monitoring')
    }
  }
  
  // Public API
  getBaselineMetrics(): Map<string, BaselineMetric> {
    return new Map(this.baselineMetrics)
  }
  
  getImpactHistory(): Map<string, ImpactMeasurement> {
    return new Map(this.impactHistory)
  }
  
  getAssessmentResults(): Map<string, AssessmentResult> {
    return new Map(this.assessmentResults)
  }
  
  recaptureBaseline(): void {
    this.captureBaseline()
    console.log('📊 Performance baseline recaptured')
  }
  
  cleanup(): void {
    this.stopContinuousMonitoring()
    this.baselineMetrics.clear()
    this.impactHistory.clear()
    this.assessmentResults.clear()
  }
}

// Interfaces
interface BaselineMetric {
  name: string
  baseline: number
  timestamp: number
  variance: number
  samples: number[]
}

interface ImpactMeasurement {
  metricId: string
  name: string
  baseline: number
  current: number
  samples: number[]
  variance: number
  standardDeviation: number
  impact: ImpactLevel
  impactPercentage: number
  significance: SignificanceLevel
}

interface ImpactAssessment {
  phase: 'core' | 'safety' | 'advanced'
  overallImpact: ImpactLevel
  metrics: Record<string, ImpactMeasurement>
  recommendations: string[]
  duration: number
  confidence: number
}

interface AssessmentResult {
  phase: 'core' | 'safety' | 'advanced'
  timestamp: number
  overallImpact: ImpactLevel
  metrics: Record<string, ImpactMeasurement>
  recommendations: string[]
  confidence: number
}

type ImpactLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'
type SignificanceLevel = 'insignificant' | 'low' | 'medium' | 'high'

// Global performance impact assessor instance
export const performanceImpactAssessor = new PerformanceImpactAssessor()

// Reactive hook for performance impact assessment
export function usePerformanceImpactAssessor() {
  const [isAssessing, setIsAssessing] = createSignal(performanceImpactAssessor.isAssessing)
  const [baseline, setBaseline] = createSignal<Map<string, BaselineMetric>>(performanceImpactAssessor.getBaselineMetrics())
  const [results, setResults] = createSignal<Map<string, AssessmentResult>>(performanceImpactAssessor.getAssessmentResults())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setIsAssessing(performanceImpactAssessor.isAssessing)
      setBaseline(performanceImpactAssessor.getBaselineMetrics())
      setResults(performanceImpactAssessor.getAssessmentResults())
    }, 1000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return {
    isAssessing,
    baseline,
    results,
    assessPerformanceImpact: (phase: 'core' | 'safety' | 'advanced') => performanceImpactAssessor.assessPerformanceImpact(phase),
    startContinuousMonitoring: () => performanceImpactAssessor.startContinuousMonitoring(),
    stopContinuousMonitoring: () => performanceImpactAssessor.stopContinuousMonitoring(),
    recaptureBaseline: () => performanceImpactAssessor.recaptureBaseline()
  }
}
