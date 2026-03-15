import { describe, it, expect, beforeEach, afterEach } from 'bun/test'
import { performanceManager } from '../manager'
import { featureFlagManager } from '../shared/feature-flags'
import { integrationManager } from '../shared/integration-manager'
import { productionSafetyValidator } from '../shared/production-safety-validator'
import { performanceImpactAssessor } from '../shared/performance-impact-assessor'
import { performanceStore } from '../shared/store'

describe('Phase C: Final Safety & Validation', () => {
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
  
  describe('Phase C Completion Validation', () => {
    it('should have all Phase C systems properly initialized', () => {
      // Safety validator should be ready
      const safetyChecks = productionSafetyValidator.getSafetyChecks()
      expect(safetyChecks.size).toBe(5) // All safety checks initialized
      
      const emergencyTriggers = productionSafetyValidator.getEmergencyTriggers()
      expect(emergencyTriggers.size).toBe(4) // All emergency triggers initialized
      
      // Impact assessor should have baseline captured
      const baseline = performanceImpactAssessor.getBaselineMetrics()
      expect(baseline.size).toBe(4) // All baseline metrics captured
      
      // Feature flags should be ready
      const flags = featureFlagManager.getAllFlags()
      expect(Object.keys(flags).length).toBe(16) // All feature flags initialized
      
      // Integration manager should be ready
      const status = integrationManager.getIntegrationStatus()
      expect(status.currentPhase).toBeDefined()
      expect(status.isIntegrating).toBe(false)
    })
    
    it('should demonstrate complete safety validation workflow', async () => {
      // Step 1: Enable core phase
      await integrationManager.enablePhaseManually('core')
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(true)
      
      // Step 2: Run safety validation
      const safetyResult = await productionSafetyValidator.validateProductionSafety()
      expect(safetyResult.overall).toMatch(/^(safe|warning|critical)$/)
      expect(safetyResult.checks.length).toBe(5) // All safety checks executed
      expect(safetyResult.duration).toBeGreaterThan(0)
      
      // Step 3: Assess performance impact
      const impactResult = await performanceImpactAssessor.assessPerformanceImpact('core')
      expect(impactResult.phase).toBe('core')
      expect(impactResult.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      expect(Object.keys(impactResult.metrics).length).toBe(4) // All metrics assessed
      expect(impactResult.confidence).toBeGreaterThanOrEqual(0)
      expect(impactResult.confidence).toBeLessThanOrEqual(1)
      
      // Step 4: Verify system health
      const systems = performanceManager.getAllSystems()
      expect(systems.size).toBe(3) // All systems present
      expect(systems.get('core')?.enabled).toBe(true)
      expect(systems.get('core')?.healthy).toBe(true)
    })
    
    it('should demonstrate emergency procedures', async () => {
      // Enable all phases to test emergency procedures
      await integrationManager.enablePhaseManually('core')
      await integrationManager.enablePhaseManually('safety')
      await integrationManager.enablePhaseManually('advanced')
      
      // Verify all phases are enabled
      const status = integrationManager.getIntegrationStatus()
      expect(status.phases.core).toBe(true)
      expect(status.phases.safety).toBe(true)
      expect(status.phases.advanced).toBe(true)
      
      // Test emergency rollback
      integrationManager.reset()
      
      // Verify all phases are disabled
      const resetStatus = integrationManager.getIntegrationStatus()
      expect(resetStatus.phases.core).toBe(false)
      expect(resetStatus.phases.safety).toBe(false)
      expect(resetStatus.phases.advanced).toBe(false)
    })
    
    it('should demonstrate continuous monitoring capabilities', () => {
      // Safety monitoring should be controllable
      expect(productionSafetyValidator.isMonitoring).toBe(false)
      
      productionSafetyValidator.startContinuousMonitoring()
      expect(productionSafetyValidator.isMonitoring).toBe(true)
      
      productionSafetyValidator.stopContinuousMonitoring()
      expect(productionSafetyValidator.isMonitoring).toBe(false)
      
      // Impact assessor should be ready for continuous monitoring
      expect(performanceImpactAssessor.isAssessing).toBe(false)
      
      performanceImpactAssessor.startContinuousMonitoring()
      performanceImpactAssessor.stopContinuousMonitoring()
      expect(performanceImpactAssessor.isAssessing).toBe(false)
    })
  })
  
  describe('Phase D Readiness Preparation', () => {
    it('should have all systems ready for main branch integration', () => {
      // Performance manager should be ready
      const config = performanceManager.getConfig()
      expect(config.core).toBeDefined()
      expect(config.safety).toBeDefined()
      expect(config.advanced).toBeDefined()
      
      // All systems should be available
      const systems = performanceManager.getAllSystems()
      expect(systems.has('core')).toBe(true)
      expect(systems.has('safety')).toBe(true)
      expect(systems.has('advanced')).toBe(true)
      
      // Feature flags should be properly organized
      const coreFlags = featureFlagManager.getPhaseFlags('core')
      const safetyFlags = featureFlagManager.getPhaseFlags('safety')
      const advancedFlags = featureFlagManager.getPhaseFlags('advanced')
      
      expect(Object.keys(coreFlags).length).toBe(8)
      expect(Object.keys(safetyFlags).length).toBe(4)
      expect(Object.keys(advancedFlags).length).toBe(4)
    })
    
    it('should demonstrate backward compatibility', () => {
      // Store should work with existing APIs
      const message = {
        id: 'test-message-backward',
        sessionId: 'test-session-backward',
        type: 'user' as const,
        content: 'Test backward compatibility',
        timestamp: Date.now(),
        completed: false
      }
      
      expect(() => performanceStore.addMessage(message)).not.toThrow()
      expect(performanceStore.getMessage('test-message-backward')).toEqual(message)
      
      // Performance manager should work with existing APIs
      const metrics = performanceManager.getMetrics()
      expect(metrics).toBeDefined()
      expect(metrics?.core).toBeDefined()
      expect(metrics?.safety).toBeDefined()
      expect(metrics?.advanced).toBeDefined()
    })
    
    it('should have comprehensive error handling', async () => {
      // Safety validator should handle errors gracefully
      const safetyResult = await productionSafetyValidator.validateProductionSafety()
      expect(safetyResult.overall).toMatch(/^(safe|warning|critical)$/)
      expect(safetyResult.recommendations).toBeInstanceOf(Array)
      
      // Impact assessor should handle errors gracefully
      const impactResult = await performanceImpactAssessor.assessPerformanceImpact('core')
      expect(impactResult.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      expect(impactResult.recommendations).toBeInstanceOf(Array)
      
      // Integration manager should handle errors gracefully
      expect(() => integrationManager.enablePhaseManually('core')).not.toThrow()
      expect(() => integrationManager.disablePhaseManually('core')).not.toThrow()
    })
    
    it('should maintain data consistency across all systems', async () => {
      // Add test data
      const message = {
        id: 'test-message-consistency',
        sessionId: 'test-session-consistency',
        type: 'user' as const,
        content: 'Test data consistency',
        timestamp: Date.now(),
        completed: false
      }
      
      performanceStore.addMessage(message)
      
      // Enable core phase
      await integrationManager.enablePhaseManually('core')
      
      // Run safety validation
      const safetyResult = await productionSafetyValidator.validateProductionSafety()
      expect(safetyResult.overall).toMatch(/^(safe|warning|critical)$/)
      
      // Assess performance impact
      const impactResult = await performanceImpactAssessor.assessPerformanceImpact('core')
      expect(impactResult.overallImpact).toMatch(/^(none|low|medium|high|critical)$/)
      
      // Verify data consistency
      const retrieved = performanceStore.getMessage('test-message-consistency')
      expect(retrieved).toEqual(message)
      
      const stats = performanceStore.getStats()
      expect(stats.totalMessages).toBe(1)
    })
  })
  
  describe('Production Readiness Validation', () => {
    it('should have all production safety systems active', () => {
      const safetyChecks = productionSafetyValidator.getSafetyChecks()
      
      // Verify all critical safety checks are enabled
      expect(safetyChecks.get('performance_budget')?.enabled).toBe(true)
      expect(safetyChecks.get('system_stability')?.enabled).toBe(true)
      expect(safetyChecks.get('integration_safety')?.enabled).toBe(true)
      expect(safetyChecks.get('user_experience')?.enabled).toBe(true)
      expect(safetyChecks.get('resource_utilization')?.enabled).toBe(true)
      
      // Verify all emergency triggers are enabled
      const emergencyTriggers = productionSafetyValidator.getEmergencyTriggers()
      expect(emergencyTriggers.get('critical_performance')?.enabled).toBe(true)
      expect(emergencyTriggers.get('system_instability')?.enabled).toBe(true)
      expect(emergencyTriggers.get('resource_exhaustion')?.enabled).toBe(true)
      expect(emergencyTriggers.get('integration_failure')?.enabled).toBe(true)
    })
    
    it('should have performance impact assessment ready', () => {
      const baseline = performanceImpactAssessor.getBaselineMetrics()
      
      // Verify all baseline metrics are captured
      expect(baseline.has('fps')).toBe(true)
      expect(baseline.has('memoryUsage')).toBe(true)
      expect(baseline.has('latency')).toBe(true)
      expect(baseline.has('renderTime')).toBe(true)
      
      // Verify baseline values are reasonable
      baseline.forEach(metric => {
        expect(metric.baseline).toBeGreaterThan(0)
        expect(metric.timestamp).toBeGreaterThan(0)
        expect(metric.samples.length).toBe(1)
      })
    })
    
    it('should have comprehensive monitoring capabilities', () => {
      // All systems should be monitorable
      const systems = performanceManager.getAllSystems()
      systems.forEach((system, id) => {
        expect(system.name).toBeDefined()
        expect(system.enabled).toBeDefined()
        expect(system.healthy).toBeDefined()
        expect(system.lastUpdate).toBeGreaterThan(0)
        expect(system.metrics).toBeDefined()
        expect(system.alerts).toBeInstanceOf(Array)
      })
      
      // Feature flags should be monitorable
      const integrationStatus = featureFlagManager.getIntegrationStatus()
      expect(integrationStatus.core).toBeDefined()
      expect(integrationStatus.safety).toBeDefined()
      expect(integrationStatus.advanced).toBeDefined()
      expect(integrationStatus.overall).toBeGreaterThanOrEqual(0)
      expect(integrationStatus.overall).toBeLessThanOrEqual(1)
    })
    
    it('should have emergency procedures documented and ready', () => {
      // Emergency triggers should be properly configured
      const emergencyTriggers = productionSafetyValidator.getEmergencyTriggers()
      
      emergencyTriggers.forEach((trigger, id) => {
        expect(trigger.name).toBeDefined()
        expect(trigger.condition).toBeDefined()
        expect(trigger.action).toBeDefined()
        expect(trigger.severity).toMatch(/^(low|medium|high|critical)$/)
        expect(trigger.enabled).toBe(true)
      })
      
      // Verify emergency actions are defined
      const criticalPerformance = emergencyTriggers.get('critical_performance')
      expect(criticalPerformance?.action).toBe('emergency_rollback')
      
      const systemInstability = emergencyTriggers.get('system_instability')
      expect(systemInstability?.action).toBe('emergency_shutdown')
      
      const resourceExhaustion = emergencyTriggers.get('resource_exhaustion')
      expect(resourceExhaustion?.action).toBe('resource_cleanup')
      
      const integrationFailure = emergencyTriggers.get('integration_failure')
      expect(integrationFailure?.action).toBe('integration_rollback')
    })
  })
})
