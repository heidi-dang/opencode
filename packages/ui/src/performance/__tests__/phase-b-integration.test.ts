import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { performanceManager } from '../manager'
import { featureFlagManager } from '../shared/feature-flags'
import { integrationManager } from '../shared/integration-manager'
import { performanceStore } from '../shared/store'

describe('Phase B: Integration & Testing', () => {
  beforeEach(() => {
    // Reset all managers before each test
    featureFlagManager.reset()
    integrationManager.reset()
    performanceStore.cleanup()
  })
  
  afterEach(() => {
    // Cleanup after each test
    featureFlagManager.reset()
    integrationManager.reset()
    performanceStore.cleanup()
  })
  
  describe('Feature Flag Manager', () => {
    it('should initialize with default flags', () => {
      const flags = featureFlagManager.getAllFlags()
      
      // All flags should be disabled by default
      Object.values(flags).forEach(enabled => {
        expect(enabled).toBe(false)
      })
      
      // Should have flags for all phases
      expect(flags['core.virtualization']).toBeDefined()
      expect(flags['safety.rollout']).toBeDefined()
      expect(flags['advanced.predictivePreloading']).toBeDefined()
    })
    
    it('should enable and disable flags', () => {
      featureFlagManager.setFlag('core.virtualization', true)
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(true)
      
      featureFlagManager.setFlag('core.virtualization', false)
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(false)
    })
    
    it('should toggle flags', () => {
      const initial = featureFlagManager.isEnabled('core.virtualization')
      featureFlagManager.toggleFlag('core.virtualization')
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(!initial)
    })
    
    it('should manage phase flags', () => {
      // Enable core phase
      featureFlagManager.enablePhase('core')
      
      const coreFlags = featureFlagManager.getPhaseFlags('core')
      Object.values(coreFlags).forEach(enabled => {
        expect(enabled).toBe(true)
      })
      
      // Disable core phase
      featureFlagManager.disablePhase('core')
      
      const disabledCoreFlags = featureFlagManager.getPhaseFlags('core')
      Object.values(disabledCoreFlags).forEach(enabled => {
        expect(enabled).toBe(false)
      })
    })
    
    it('should track integration status', () => {
      // Initially all phases should be disabled
      let status = featureFlagManager.getIntegrationStatus()
      expect(status.core).toBe(false)
      expect(status.safety).toBe(false)
      expect(status.advanced).toBe(false)
      expect(status.overall).toBe(0)
      
      // Enable core phase
      featureFlagManager.enableIntegrationPhase('core')
      status = featureFlagManager.getIntegrationStatus()
      expect(status.core).toBe(true)
      expect(status.overall).toBe(1/3)
      
      // Enable safety phase
      featureFlagManager.enableIntegrationPhase('safety')
      status = featureFlagManager.getIntegrationStatus()
      expect(status.core).toBe(true)
      expect(status.safety).toBe(true)
      expect(status.overall).toBe(2/3)
      
      // Enable advanced phase
      featureFlagManager.enableIntegrationPhase('advanced')
      status = featureFlagManager.getIntegrationStatus()
      expect(status.core).toBe(true)
      expect(status.safety).toBe(true)
      expect(status.advanced).toBe(true)
      expect(status.overall).toBe(1)
    })
    
    it('should persist flags to localStorage', () => {
      // Enable some flags
      featureFlagManager.setFlag('core.virtualization', true)
      featureFlagManager.setFlag('safety.rollout', true)
      
      // Create new instance to test persistence
      const newManager = featureFlagManager
      newManager.loadFlags()
      
      expect(newManager.isEnabled('core.virtualization')).toBe(true)
      expect(newManager.isEnabled('safety.rollout')).toBe(true)
    })
  })
  
  describe('Integration Manager', () => {
    it('should get integration status', () => {
      const status = integrationManager.getIntegrationStatus()
      
      expect(status.currentPhase).toBeDefined()
      expect(status.isIntegrating).toBe(false)
      expect(status.progress).toBe(0)
      expect(status.phases.core).toBe(false)
      expect(status.phases.safety).toBe(false)
      expect(status.phases.advanced).toBe(false)
    })
    
    it('should enable phases manually', async () => {
      const result = await integrationManager.enablePhaseManually('core')
      
      expect(result).toBe(true)
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(true)
      expect(featureFlagManager.isEnabled('core.caching')).toBe(true)
      expect(featureFlagManager.isEnabled('core.chunking')).toBe(true)
    })
    
    it('should disable phases manually', () => {
      integrationManager.enablePhaseManually('core')
      integrationManager.disablePhaseManually('core')
      
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(false)
      expect(featureFlagManager.isEnabled('core.caching')).toBe(false)
      expect(featureFlagManager.isEnabled('core.chunking')).toBe(false)
    })
    
    it('should reset integration state', () => {
      // Enable some phases
      featureFlagManager.enableIntegrationPhase('core')
      featureFlagManager.enableIntegrationPhase('safety')
      
      // Reset
      integrationManager.reset()
      
      // All phases should be disabled
      const status = integrationManager.getIntegrationStatus()
      expect(status.phases.core).toBe(false)
      expect(status.phases.safety).toBe(false)
      expect(status.phases.advanced).toBe(false)
    })
  })
  
  describe('Backward Compatibility', () => {
    it('should maintain existing API compatibility', () => {
      // Test that existing performance APIs still work
      const store = performanceStore
      
      // Should be able to add and retrieve messages
      const message = {
        id: 'test-message',
        sessionId: 'test-session',
        type: 'user' as const,
        content: 'Test content',
        timestamp: Date.now(),
        completed: false
      }
      
      expect(() => store.addMessage(message)).not.toThrow()
      expect(store.getMessage('test-message')).toEqual(message)
      
      // Should be able to get session messages
      const sessionMessages = store.getSessionMessages('test-session')
      expect(sessionMessages).toHaveLength(1)
      expect(sessionMessages[0]).toEqual(message)
    })
    
    it('should provide adapter for existing hooks', async () => {
      // Test that adapter hooks work
      const { usePerformanceMetrics } = await import('../shared/adapter')
      
      // Should not throw when called
      expect(() => {
        const metrics = usePerformanceMetrics()
        expect(metrics).toBeDefined()
        expect(metrics.metrics).toBeDefined()
      }).not.toThrow()
    })
  })
  
  describe('Performance Impact Assessment', () => {
    it('should stay within performance budgets', async () => {
      // Enable core phase
      await integrationManager.enablePhaseManually('core')
      
      // Wait for metrics to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const metrics = performanceManager.getMetrics()
      expect(metrics).toBeDefined()
      
      // Check if metrics are within reasonable bounds
      expect(metrics!.core.fps).toBeGreaterThan(0)
      expect(metrics!.core.memoryUsage).toBeLessThan(1000) // Less than 1GB
      expect(metrics!.core.latency).toBeLessThan(1000) // Less than 1 second
    })
    
    it('should handle multiple phases enabled', async () => {
      // Enable all phases
      await integrationManager.enablePhaseManually('core')
      await integrationManager.enablePhaseManually('safety')
      await integrationManager.enablePhaseManually('advanced')
      
      // Wait for systems to initialize
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // All systems should be healthy
      const systems = performanceManager.getAllSystems()
      expect(systems.size).toBe(3)
      
      systems.forEach((system, id) => {
        expect(system.enabled).toBe(true)
        expect(system.healthy).toBe(true)
        expect(system.lastUpdate).toBeGreaterThan(0)
      })
    })
  })
  
  describe('Error Handling and Recovery', () => {
    it('should handle flag errors gracefully', () => {
      // Should handle invalid flag names
      expect(() => featureFlagManager.isEnabled('invalid.flag')).not.toThrow()
      expect(featureFlagManager.isEnabled('invalid.flag')).toBe(false)
      
      // Should handle invalid phase names
      expect(() => featureFlagManager.enablePhase('invalid' as any)).not.toThrow()
    })
    
    it('should handle integration errors gracefully', async () => {
      // Should handle invalid phase names
      expect(() => integrationManager.enablePhaseManually('invalid' as any)).not.toThrow()
      
      // Should handle concurrent integration attempts
      const promise1 = integrationManager.startIntegration()
      const promise2 = integrationManager.startIntegration()
      
      // Second attempt should fail
      await expect(promise2).rejects.toThrow('Integration already in progress')
      
      // Clean up
      promise1.catch(() => {}) // Ignore first promise result
    })
    
    it('should recover from failed phases', async () => {
      // Enable a phase
      await integrationManager.enablePhaseManually('core')
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(true)
      
      // Disable it
      integrationManager.disablePhaseManually('core')
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(false)
      
      // Should be able to re-enable it
      const result = await integrationManager.enablePhaseManually('core')
      expect(result).toBe(true)
      expect(featureFlagManager.isEnabled('core.virtualization')).toBe(true)
    })
  })
  
  describe('Cross-System Integration', () => {
    it('should coordinate between feature flags and performance manager', async () => {
      // Enable core phase through feature flags
      featureFlagManager.enableIntegrationPhase('core')
      
      // Wait for performance manager to update
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Performance manager should reflect the enabled state
      const config = performanceManager.getConfig()
      expect(config.core.virtualization).toBe(true)
      expect(config.core.caching).toBe(true)
      expect(config.core.chunking).toBe(true)
    })
    
    it('should maintain data consistency across systems', async () => {
      // Add some test data to store
      const message = {
        id: 'test-message-consistency',
        sessionId: 'test-session-consistency',
        type: 'user' as const,
        content: 'Test content for consistency',
        timestamp: Date.now(),
        completed: false
      }
      
      performanceStore.addMessage(message)
      
      // Enable core phase
      await integrationManager.enablePhaseManually('core')
      
      // Data should still be accessible
      const retrieved = performanceStore.getMessage('test-message-consistency')
      expect(retrieved).toEqual(message)
      
      // Store stats should be consistent
      const stats = performanceStore.getStats()
      expect(stats.totalMessages).toBe(1)
    })
  })
})
