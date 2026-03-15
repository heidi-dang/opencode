import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { performanceManager } from '../manager'
import { featureFlagManager } from '../shared/feature-flags'
import { integrationManager } from '../shared/integration-manager'
import { productionSafetyValidator } from '../shared/production-safety-validator'
import { performanceImpactAssessor } from '../shared/performance-impact-assessor'
import { performanceStore } from '../shared/store'

describe('Phase C: Safety & Validation', () => {
  beforeEach(() => {
    // Reset all managers before each test
    featureFlagManager.reset()
    integrationManager.reset()
    performanceStore.cleanup()
  })
  
  afterEach(() => {
    // Cleanup after each test
    productionSafetyValidator.cleanup()
    performanceImpactAssessor.cleanup()
    featureFlagManager.reset()
    integrationManager.reset()
    performanceStore.cleanup()
  })
  
  describe('Production Safety Validator', () => {
    it('should initialize with safety checks', () => {
      const safetyChecks = productionSafetyValidator.getSafetyChecks()
      
      expect(safetyChecks.size).toBeGreaterThan(0)
      expect(safetyChecks.has('performance_budget')).toBe(true)
      expect(safetyChecks.has('system_stability')).toBe(true)
      expect(safetyChecks.has('integration_safety')).toBe(true)
      expect(safetyChecks.has('user_experience')).toBe(true)
      expect(safetyChecks.has('resource_utilization')).toBe(true)
    })
    
    it('should initialize with emergency triggers', () => {
      const emergencyTriggers = productionSafetyValidator.getEmergencyTriggers()
      
      expect(emergencyTriggers.size).toBeGreaterThan(0)
      expect(emergencyTriggers.has('critical_performance')).toBe(true)
      expect(emergencyTriggers.has('system_instability')).toBe(true)
      expect(emergencyTriggers.has('resource_exhaustion')).toBe(true)
      expect(emergencyTriggers.has('integration_failure')).toBe(true)
    })
    
    it('should validate production safety', async () => {
      const result = await productionSafetyValidator.validateProductionSafety()
      
      expect(result).toBeDefined()
      expect(result.overall).toMatch(/^(safe|warning|critical)$/)
      expect(result.checks).toBeInstanceOf(Array)
      expect(result.recommendations).toBeInstanceOf(Array)
      expect(result.duration).toBeGreaterThan(0)
    })
    
    it('should handle emergency triggers', async () => {
      // Enable core phase to trigger some activity
      await integrationManager.enablePhaseManually('core')
      
      const result = await productionSafetyValidator.validateProductionSafety()
      
      // Should not trigger emergency actions in normal conditions
      expect(result.emergencyActions).toBeInstanceOf(Array)
      expect(result.overall).toBe('safe') // Should be safe in test conditions
    })
    
    it('should start and stop continuous monitoring', () => {
      expect(productionSafetyValidator.isMonitoring).toBe(false)
      
      productionSafetyValidator.startContinuousMonitoring()
      expect(productionSafetyValidator.isMonitoring).toBe(true)
      
      productionSafetyValidator.stopContinuousMonitoring()
      expect(productionSafetyValidator.isMonitoring).toBe(false)
    })
    
    it('should update safety checks', () => {
      const safetyChecks = productionSafetyValidator.getSafetyChecks()
      const originalCheck = safetyChecks.get('performance_budget')
      
      expect(originalCheck).toBeDefined()
      expect(originalCheck!.enabled).toBe(true)
      
      productionSafetyValidator.updateSafetyCheck('performance_budget', { enabled: false })
      
      const updatedCheck = safetyChecks.get('performance_budget')
      expect(updatedCheck!.enabled).toBe(false)
    })
    
    it('should update emergency triggers', () => {
      const emergencyTriggers = productionSafetyValidator.getEmergencyTriggers()
      const originalTrigger = emergencyTriggers.get('critical_performance')
      
      expect(originalTrigger).toBeDefined()
      expect(originalTrigger!.enabled).toBe(true)
      
      productionSafetyValidator.updateEmergencyTrigger('critical_performance', { enabled: false })
      
      const updatedTrigger = emergencyTriggers.get('critical_performance')
      expect(updatedTrigger!.enabled).toBe(false)
    })
  })
  
  describe('Performance Impact Assessor', () => {
    it('should capture baseline metrics', () => {
      const baseline = performanceImpactAssessor.getBaselineMetrics()
      
      expect(baseline.size).toBeGreaterThan(0)
      expect(baseline.has('fps')).toBe(true)
      expect(baseline.has('memoryUsage')).toBe(true)
      expect(baseline.has('latency')).toBe(true)
      expect(baseline.has('renderTime')).toBe(true)
      
      baseline.forEach(metric => {
        expect(metric.name).toBeDefined()
        expect(metric.baseline).toBeGreaterThan(0)
        expect(metric.timestamp).toBeGreaterThan(0)
        expect(metric.samples).toBeInstanceOf(Array)
        expect(metric.samples.length).toBe(1)
      })
    })
    
    it('should assess performance impact for core phase', async () => {
      const result = await performanceImpactAssessor.assessPerformanceImpact('core')
      
      expect(result).toBeDefined()
      expect(result.phase).toBe('core')
      expect(result.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      expect(result.metrics).toBeInstanceOf(Object)
      expect(result.recommendations).toBeInstanceOf(Array)
      expect(result.duration).toBeGreaterThan(0)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
    
    it('should assess performance impact for safety phase', async () => {
      const result = await performanceImpactAssessor.assessPerformanceImpact('safety')
      
      expect(result).toBeDefined()
      expect(result.phase).toBe('safety')
      expect(result.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      expect(result.metrics).toBeInstanceOf(Object)
      expect(result.recommendations).toBeInstanceOf(Array)
    })
    
    it('should assess performance impact for advanced phase', async () => {
      const result = await performanceImpactAssessor.assessPerformanceImpact('advanced')
      
      expect(result).toBeDefined()
      expect(result.phase).toBe('advanced')
      expect(result.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      expect(result.metrics).toBeInstanceOf(Object)
      expect(result.recommendations).toBeInstanceOf(Array)
    })
    
    it('should recapture baseline', () => {
      const originalBaseline = performanceImpactAssessor.getBaselineMetrics()
      const originalFps = originalBaseline.get('fps')!.baseline
      
      performanceImpactAssessor.recaptureBaseline()
      
      const newBaseline = performanceImpactAssessor.getBaselineMetrics()
      const newFps = newBaseline.get('fps')!.baseline
      
      expect(newFps).toBeGreaterThan(0)
      // Baseline should be similar (within reasonable range)
      expect(Math.abs(newFps - originalFps)).toBeLessThan(50)
    })
    
    it('should start and stop continuous monitoring', () => {
      expect(performanceImpactAssessor.isAssessing).toBe(false)
      
      performanceImpactAssessor.startContinuousMonitoring()
      expect(performanceImpactAssessor.isAssessing).toBe(false) // Should not change immediately
      
      performanceImpactAssessor.stopContinuousMonitoring()
      expect(performanceImpactAssessor.isAssessing).toBe(false)
    })
    
    it('should handle concurrent assessments', async () => {
      const assessment1 = performanceImpactAssessor.assessPerformanceImpact('core')
      
      // Second assessment should fail because first is in progress
      await expect(performanceImpactAssessor.assessPerformanceImpact('safety')).rejects.toThrow('Performance impact assessment already in progress')
      
      // Wait for first assessment to complete
      await assessment1
      
      // Should be able to assess again
      const result = await performanceImpactAssessor.assessPerformanceImpact('advanced')
      expect(result.phase).toBe('advanced')
    })
  })
  
  describe('Safety & Validation Integration', () => {
    it('should coordinate safety validation with feature flags', async () => {
      // Enable core phase
      featureFlagManager.enableIntegrationPhase('core')
      
      // Run safety validation
      const safetyResult = await productionSafetyValidator.validateProductionSafety()
      
      expect(safetyResult.overall).toMatch(/^(safe|warning|critical)$/)
      expect(safetyResult.checks.length).toBeGreaterThan(0)
      
      // Assess performance impact
      const impactResult = await performanceImpactAssessor.assessPerformanceImpact('core')
      
      expect(impactResult.phase).toBe('core')
      expect(impactResult.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
    })
    
    it('should handle multiple phases enabled', async () => {
      // Enable multiple phases
      await integrationManager.enablePhaseManually('core')
      await integrationManager.enablePhaseManually('safety')
      
      // Validate safety
      const safetyResult = await productionSafetyValidator.validateProductionSafety()
      expect(safetyResult.overall).toMatch(/^(safe|warning|critical)$/)
      
      // Assess impact for each phase
      const coreImpact = await performanceImpactAssessor.assessPerformanceImpact('core')
      const safetyImpact = await performanceImpactAssessor.assessPerformanceImpact('safety')
      
      expect(coreImpact.phase).toBe('core')
      expect(safetyImpact.phase).toBe('safety')
      
      // Results should be consistent
      expect(coreImpact.confidence).toBeGreaterThan(0)
      expect(safetyImpact.confidence).toBeGreaterThan(0)
    })
    
    it('should maintain data consistency across systems', async () => {
      // Add test data to store
      const message = {
        id: 'test-message-safety',
        sessionId: 'test-session-safety',
        type: 'user' as const,
        content: 'Test content for safety validation',
        timestamp: Date.now(),
        completed: false
      }
      
      performanceStore.addMessage(message)
      
      // Enable core phase
      await integrationManager.enablePhaseManually('core')
      
      // Run safety validation
      const safetyResult = await productionSafetyValidator.validateProductionSafety()
      
      // Assess performance impact
      const impactResult = await performanceImpactAssessor.assessPerformanceImpact('core')
      
      // Data should still be accessible
      const retrieved = performanceStore.getMessage('test-message-safety')
      expect(retrieved).toEqual(message)
      
      // Results should be valid
      expect(safetyResult.overall).toMatch(/^(safe|warning|critical)$/)
      expect(impactResult.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
    })
  })
  
  describe('Error Handling and Recovery', () => {
    it('should handle safety validation errors gracefully', async () => {
      // Mock a scenario that might cause errors
      const originalGetMetrics = performanceManager.getMetrics
      performanceManager.getMetrics = () => null as any
      
      const result = await productionSafetyValidator.validateProductionSafety()
      
      // Should handle the error gracefully
      expect(result.overall).toBe('critical')
      expect(result.recommendations.length).toBeGreaterThan(0)
      expect(result.duration).toBeGreaterThan(0)
      
      // Restore original method
      performanceManager.getMetrics = originalGetMetrics
    })
    
    it('should handle impact assessment errors gracefully', async () => {
      // Mock a scenario that might cause errors
      const originalGetMetrics = performanceManager.getMetrics
      performanceManager.getMetrics = () => null as any
      
      const result = await performanceImpactAssessor.assessPerformanceImpact('core')
      
      // Should handle the error gracefully
      expect(result.overallImpact).toBe('critical')
      expect(result.recommendations.length).toBeGreaterThan(0)
      expect(result.duration).toBeGreaterThan(0)
      
      // Restore original method
      performanceManager.getMetrics = originalGetMetrics
    })
    
    it('should recover from failed validations', async () => {
      // First validation might fail
      const result1 = await productionSafetyValidator.validateProductionSafety()
      expect(result1.overall).toMatch(/^(safe|warning|critical)$/)
      
      // Second validation should work
      const result2 = await productionSafetyValidator.validateProductionSafety()
      expect(result2.overall).toMatch(/^(safe|warning|critical)$/)
      expect(result2.duration).toBeGreaterThan(0)
    })
    
    it('should recover from failed impact assessments', async () => {
      // First assessment
      const result1 = await performanceImpactAssessor.assessPerformanceImpact('core')
      expect(result1.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      
      // Second assessment should work
      const result2 = await performanceImpactAssessor.assessPerformanceImpact('core')
      expect(result2.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      expect(result2.duration).toBeGreaterThan(0)
    })
  })
  
  describe('Performance Budget Enforcement', () => {
    it('should enforce performance budgets during validation', async () => {
      // Enable core phase
      await integrationManager.enablePhaseManually('core')
      
      const result = await productionSafetyValidator.validateProductionSafety()
      
      // Check performance budget validation
      const performanceBudgetCheck = result.checks.find(c => c.checkId === 'performance_budget')
      expect(performanceBudgetCheck).toBeDefined()
      
      if (performanceBudgetCheck) {
        expect(performanceBudgetCheck.name).toBe('Performance Budget')
        expect(performanceBudgetCheck.status).toMatch(/^(safe|warning|critical)$/)
        expect(performanceBudgetCheck.score).toBeGreaterThanOrEqual(0)
        expect(performanceBudgetCheck.score).toBeLessThanOrEqual(100)
      }
    })
    
    it('should track resource utilization', async () => {
      // Enable multiple phases to increase resource usage
      await integrationManager.enablePhaseManually('core')
      await integrationManager.enablePhaseManually('safety')
      
      const result = await productionSafetyValidator.validateProductionSafety()
      
      // Check resource utilization validation
      const resourceCheck = result.checks.find(c => c.checkId === 'resource_utilization')
      expect(resourceCheck).toBeDefined()
      
      if (resourceCheck) {
        expect(resourceCheck.name).toBe('Resource Utilization')
        expect(resourceCheck.status).toMatch(/^(safe|warning|critical)$/)
        expect(resourceCheck.metrics).toBeDefined()
      }
    })
  })
})
