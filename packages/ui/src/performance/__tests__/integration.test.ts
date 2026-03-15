import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { performanceManager } from '../manager'
import { performanceStore } from '../shared/store'
import { PerformanceConfig } from '../shared/types'

describe('Performance System Integration Tests', () => {
  beforeEach(() => {
    // Reset performance manager before each test
    performanceManager.updateConfig({
      core: {
        virtualization: true,
        caching: true,
        chunking: true,
        subtreeFreezing: true,
        backpressure: true,
        lazyMounting: true,
        cssContainment: true,
        outputCollapsing: true
      },
      safety: {
        rollout: true,
        budgetEnforcement: true,
        emergencySystems: true,
        productionAnalytics: true
      },
      advanced: {
        predictivePreloading: true,
        mlOptimization: true,
        realTimeAnalytics: true,
        uxOptimization: true
      }
    })
  })
  
  afterEach(() => {
    // Cleanup after each test
    performanceStore.cleanup()
  })
  
  describe('Performance Manager', () => {
    it('should initialize with default config', () => {
      const config = performanceManager.getConfig()
      expect(config.core.virtualization).toBe(true)
      expect(config.safety.rollout).toBe(true)
      expect(config.advanced.predictivePreloading).toBe(true)
    })
    
    it('should collect metrics periodically', async () => {
      // Wait for metrics to be collected
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      const metrics = performanceManager.getMetrics()
      expect(metrics).toBeDefined()
      expect(metrics!.core.fps).toBeGreaterThan(0)
      expect(metrics!.core.memoryUsage).toBeGreaterThan(0)
    })
    
    it('should generate alerts for threshold violations', async () => {
      // Wait for metrics collection and alert generation
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      const alerts = performanceManager.getAlerts()
      expect(Array.isArray(alerts)).toBe(true)
    })
    
    it('should enable and disable systems', () => {
      performanceManager.disableSystem('core')
      const coreSystem = performanceManager.getSystem('core')
      expect(coreSystem?.enabled).toBe(false)
      
      performanceManager.enableSystem('core')
      expect(coreSystem?.enabled).toBe(true)
    })
    
    it('should resolve alerts', () => {
      const initialAlerts = performanceManager.getAlerts()
      if (initialAlerts.length > 0) {
        const alertId = initialAlerts[0].id
        performanceManager.resolveAlert(alertId)
        
        const resolvedAlert = performanceManager.getAlerts().find(a => a.id === alertId)
        expect(resolvedAlert?.resolved).toBe(true)
      }
    })
  })
  
  describe('Performance Store', () => {
    it('should store and retrieve messages', () => {
      const message = {
        id: 'test-message-1',
        sessionId: 'test-session-1',
        type: 'user' as const,
        content: 'Test message',
        timestamp: Date.now(),
        completed: false
      }
      
      performanceStore.addMessage(message)
      const retrieved = performanceStore.getMessage('test-message-1')
      
      expect(retrieved).toEqual(message)
    })
    
    it('should store and retrieve parts', () => {
      const part = {
        id: 'test-part-1',
        messageId: 'test-message-1',
        type: 'text' as const,
        content: 'Test part',
        status: 'pending' as const,
        streaming: false,
        completed: false
      }
      
      performanceStore.addPart(part)
      const retrieved = performanceStore.getPart('test-part-1')
      
      expect(retrieved).toEqual(part)
    })
    
    it('should manage session messages', () => {
      const message1 = {
        id: 'test-message-1',
        sessionId: 'test-session-1',
        type: 'user' as const,
        content: 'Test message 1',
        timestamp: Date.now(),
        completed: false
      }
      
      const message2 = {
        id: 'test-message-2',
        sessionId: 'test-session-1',
        type: 'assistant' as const,
        content: 'Test message 2',
        timestamp: Date.now(),
        completed: false
      }
      
      performanceStore.addMessage(message1)
      performanceStore.addMessage(message2)
      
      const sessionMessages = performanceStore.getSessionMessages('test-session-1')
      expect(sessionMessages).toHaveLength(2)
      expect(sessionMessages[0].id).toBe('test-message-1')
      expect(sessionMessages[1].id).toBe('test-message-2')
    })
    
    it('should manage message parts', () => {
      const message = {
        id: 'test-message-1',
        sessionId: 'test-session-1',
        type: 'user' as const,
        content: 'Test message',
        timestamp: Date.now(),
        completed: false
      }
      
      const part1 = {
        id: 'test-part-1',
        messageId: 'test-message-1',
        type: 'text' as const,
        content: 'Test part 1',
        status: 'pending' as const,
        streaming: false,
        completed: false
      }
      
      const part2 = {
        id: 'test-part-2',
        messageId: 'test-message-1',
        type: 'tool' as const,
        content: 'Test part 2',
        status: 'pending' as const,
        streaming: false,
        completed: false
      }
      
      performanceStore.addMessage(message)
      performanceStore.addPart(part1)
      performanceStore.addPart(part2)
      
      const messageParts = performanceStore.getMessageParts('test-message-1')
      expect(messageParts).toHaveLength(2)
    })
    
    it('should track streaming sessions', () => {
      performanceStore.setStreamingSession('test-session-1', true)
      expect(performanceStore.isSessionStreaming('test-session-1')).toBe(true)
      
      performanceStore.setStreamingSession('test-session-1', false)
      expect(performanceStore.isSessionStreaming('test-session-1')).toBe(false)
    })
    
    it('should provide statistics', () => {
      const message = {
        id: 'test-message-1',
        sessionId: 'test-session-1',
        type: 'user' as const,
        content: 'Test message',
        timestamp: Date.now(),
        completed: false
      }
      
      const part = {
        id: 'test-part-1',
        messageId: 'test-message-1',
        type: 'text' as const,
        content: 'Test part',
        status: 'pending' as const,
        streaming: false,
        completed: false
      }
      
      performanceStore.addMessage(message)
      performanceStore.addPart(part)
      
      const stats = performanceStore.getStats()
      expect(stats.totalMessages).toBe(1)
      expect(stats.totalParts).toBe(1)
    })
  })
  
  describe('System Integration', () => {
    it('should maintain system health', async () => {
      // Wait for system to initialize
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      const systems = performanceManager.getAllSystems()
      expect(systems.size).toBe(3) // core, safety, advanced
      
      systems.forEach((system, id) => {
        expect(system.name).toBeDefined()
        expect(system.lastUpdate).toBeGreaterThan(0)
        expect(Array.isArray(system.alerts)).toBe(true)
      })
    })
    
    it('should handle configuration changes', () => {
      const newConfig: Partial<PerformanceConfig> = {
        core: {
          virtualization: false,
          caching: true,
          chunking: true,
          subtreeFreezing: true,
          backpressure: true,
          lazyMounting: true,
          cssContainment: true,
          outputCollapsing: true
        }
      }
      
      performanceManager.updateConfig(newConfig)
      const config = performanceManager.getConfig()
      expect(config.core.virtualization).toBe(false)
      expect(config.core.caching).toBe(true)
    })
  })
  
  describe('Performance Budgets', () => {
    it('should stay within performance budgets', async () => {
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      const metrics = performanceManager.getMetrics()
      expect(metrics).toBeDefined()
      
      // Check if metrics are within reasonable bounds
      expect(metrics!.core.fps).toBeGreaterThan(0)
      expect(metrics!.core.memoryUsage).toBeLessThan(1000) // Less than 1GB
      expect(metrics!.core.latency).toBeLessThan(1000) // Less than 1 second
    })
  })
  
  describe('Error Handling', () => {
    it('should handle invalid operations gracefully', () => {
      expect(() => performanceStore.getMessage('non-existent')).not.toThrow()
      expect(() => performanceStore.getPart('non-existent')).not.toThrow()
      expect(() => performanceStore.getSessionMessages('non-existent')).not.toThrow()
      expect(() => performanceStore.getMessageParts('non-existent')).not.toThrow()
    })
    
    it('should handle system errors', () => {
      expect(() => performanceManager.getSystem('non-existent')).not.toThrow()
      expect(() => performanceManager.resolveAlert('non-existent')).not.toThrow()
    })
  })
})
