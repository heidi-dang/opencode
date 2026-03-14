import { createSignal, createEffect } from "solid-js"
import { performanceStore } from "./simple-performance-store"
import { profiler } from "./performance-monitor"
import { chunkingBatcher } from "./text-chunking-system"
import { contentCache, smartRenderer } from "./render-cache-system"

interface PerformanceTestResults {
  testName: string
  messageCount: number
  renderTime: number
  memoryUsage: number
  cacheHitRate: number
  chunkingEfficiency: number
  averageFrameTime: number
  droppedFrames: number
  recommendations: string[]
}

class PerformanceTestSuite {
  private testResults: PerformanceTestResults[] = []
  
  // Test 1: Large message list performance
  async testLargeMessageList(): Promise<PerformanceTestResults> {
    const sessionId = 'test-large-list'
    const messageCount = 1000
    
    // Setup test data
    const startTime = performance.now()
    
    // Add test messages
    for (let i = 0; i < messageCount; i++) {
      performanceStore.addMessage({
        id: `msg-${i}`,
        sessionId,
        type: i % 3 === 0 ? 'assistant' : 'user',
        content: `Test message ${i} with some content to simulate real usage. This message contains multiple sentences and various content types. `,
        timestamp: Date.now() - (messageCount - i) * 1000,
        completed: true
      })
      
      // Add some parts
      if (i % 2 === 0) {
        performanceStore.addPart({
          id: `part-${i}`,
          messageId: `msg-${i}`,
          type: 'text',
          content: `Part content for message ${i}`,
          status: 'completed',
          streaming: false,
          completed: true
        })
      }
    }
    
    const setupTime = performance.now() - startTime
    
    // Measure render performance
    const renderStart = performance.now()
    const messages = performanceStore.getSessionMessages(sessionId)
    const renderTime = performance.now() - renderStart
    
    // Memory usage estimation
    const memoryBefore = this.getMemoryUsage()
    
    // Simulate rendering all messages
    let renderedCount = 0
    for (const message of messages) {
      const rendered = smartRenderer.render(message.content || '', false, true)
      renderedCount++
    }
    
    const memoryAfter = this.getMemoryUsage()
    const memoryUsage = memoryAfter - memoryBefore
    
    // Cache performance
    const cacheStats = contentCache.getStats()
    const cacheHitRate = cacheStats.totalSize > 0 ? (cacheStats.markdown / cacheStats.totalSize) * 100 : 0
    
    // Generate recommendations
    const recommendations = this.generateRecommendations({
      messageCount,
      renderTime,
      memoryUsage,
      cacheHitRate,
      averageFrameTime: renderTime / messageCount,
      droppedFrames: 0
    })
    
    return {
      testName: 'Large Message List',
      messageCount,
      renderTime,
      memoryUsage,
      cacheHitRate,
      chunkingEfficiency: 0,
      averageFrameTime: renderTime / messageCount,
      droppedFrames: 0,
      recommendations
    }
  }
  
  // Test 2: Streaming performance
  async testStreamingPerformance(): Promise<PerformanceTestResults> {
    const sessionId = 'test-streaming'
    const messageCount = 100
    
    // Setup streaming simulation
    const startTime = performance.now()
    
    // Create a streaming message
    const messageId = 'streaming-msg'
    performanceStore.addMessage({
      id: messageId,
      sessionId,
      type: 'assistant',
      content: '',
      timestamp: Date.now(),
      completed: false
    })
    
    // Simulate streaming chunks
    const partId = 'streaming-part'
    let accumulatedContent = ''
    
    for (let i = 0; i < 50; i++) {
      const chunk = `Streaming chunk ${i} with some content. `
      accumulatedContent += chunk
      
      // Test chunking system
      chunkingBatcher.addStreamingText(messageId, partId, chunk, 'prose')
      
      // Update part
      performanceStore.addPart({
        id: partId,
        messageId,
        type: 'text',
        content: accumulatedContent,
        status: 'running',
        streaming: true,
        completed: false
      })
      
      // Small delay to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    // Complete streaming
    performanceStore.updatePart(partId, {
      streaming: false,
      completed: true,
      status: 'completed'
    })
    
    performanceStore.updatePart(messageId, { completed: true })
    
    const totalTime = performance.now() - startTime
    
    // Measure chunking efficiency
    const chunkingMetrics = chunkingBatcher.getMetrics()
    const chunkingEfficiency = chunkingMetrics.pendingChunks === 0 ? 100 : 
      (50 / (50 + chunkingMetrics.pendingChunks)) * 100
    
    // Test render performance of streaming content
    const renderStart = performance.now()
    const finalContent = accumulatedContent
    const rendered = smartRenderer.render(finalContent, false, true)
    const renderTime = performance.now() - renderStart
    
    // Memory usage
    const memoryUsage = this.getMemoryUsage()
    
    return {
      testName: 'Streaming Performance',
      messageCount,
      renderTime: totalTime,
      memoryUsage,
      cacheHitRate: 0,
      chunkingEfficiency,
      averageFrameTime: totalTime / 50,
      droppedFrames: 0,
      recommendations: this.generateStreamingRecommendations(totalTime, chunkingEfficiency)
    }
  }
  
  // Test 3: Cache performance
  async testCachePerformance(): Promise<PerformanceTestResults> {
    const testContent = `
# Sample Markdown Content

This is a **test** with *various* markdown elements.

## Code Example

\`\`\`javascript
function example() {
  console.log("Hello, world!");
  return true;
}
\`\`\`

## Lists

- Item 1
- Item 2
- Item 3

1. Numbered item
2. Another item
3. Final item

## Links

[OpenCode AI](https://opencode.ai)
    `.trim()
    
    // Clear cache first
    contentCache.clear()
    
    // Test cache misses
    const missStart = performance.now()
    for (let i = 0; i < 100; i++) {
      smartRenderer.render(testContent, false, true)
    }
    const missTime = performance.now() - missStart
    
    // Test cache hits
    const hitStart = performance.now()
    for (let i = 0; i < 100; i++) {
      smartRenderer.render(testContent, false, true)
    }
    const hitTime = performance.now() - hitStart
    
    const cacheHitRate = (hitTime / (missTime + hitTime)) * 100
    const cacheStats = contentCache.getStats()
    
    return {
      testName: 'Cache Performance',
      messageCount: 100,
      renderTime: hitTime,
      memoryUsage: cacheStats.totalSize * 100, // Estimate
      cacheHitRate,
      chunkingEfficiency: 0,
      averageFrameTime: hitTime / 100,
      droppedFrames: 0,
      recommendations: this.generateCacheRecommendations(cacheHitRate, cacheStats)
    }
  }
  
  // Test 4: Memory stress test
  async testMemoryStress(): Promise<PerformanceTestResults> {
    const sessionId = 'memory-stress'
    const messageCount = 5000
    
    const memoryBefore = this.getMemoryUsage()
    const startTime = performance.now()
    
    // Add大量 messages
    for (let i = 0; i < messageCount; i++) {
      performanceStore.addMessage({
        id: `stress-msg-${i}`,
        sessionId,
        type: i % 3 === 0 ? 'assistant' : 'user',
        content: `Stress test message ${i} with substantial content to test memory usage. `.repeat(10),
        timestamp: Date.now() - (messageCount - i) * 1000,
        completed: true
      })
    }
    
    const setupTime = performance.now() - startTime
    const memoryAfter = this.getMemoryUsage()
    const memoryUsage = memoryAfter - memoryBefore
    
    // Test cleanup
    const cleanupStart = performance.now()
    performanceStore.cleanup()
    const cleanupTime = performance.now() - cleanupStart
    
    const memoryAfterCleanup = this.getMemoryUsage()
    const memoryReclaimed = memoryAfter - memoryAfterCleanup
    
    return {
      testName: 'Memory Stress Test',
      messageCount,
      renderTime: setupTime,
      memoryUsage,
      cacheHitRate: 0,
      chunkingEfficiency: 0,
      averageFrameTime: setupTime / messageCount,
      droppedFrames: 0,
      recommendations: this.generateMemoryRecommendations(memoryUsage, memoryReclaimed)
    }
  }
  
  // Run all tests
  async runAllTests(): Promise<PerformanceTestResults[]> {
    console.log('🚀 Starting Web UI Performance Tests...')
    
    const tests = [
      () => this.testLargeMessageList(),
      () => this.testStreamingPerformance(),
      () => this.testCachePerformance(),
      () => this.testMemoryStress()
    ]
    
    const results: PerformanceTestResults[] = []
    
    for (const test of tests) {
      try {
        console.log(`Running ${test.name}...`)
        const result = await test()
        results.push(result)
        console.log(`✅ ${result.testName}: ${result.renderTime.toFixed(2)}ms`)
      } catch (error) {
        console.error(`❌ ${test.name} failed:`, error)
      }
    }
    
    this.testResults = results
    this.generateReport(results)
    
    return results
  }
  
  // Generate performance report
  private generateReport(results: PerformanceTestResults[]): void {
    console.log('\n📊 Web UI Performance Test Report')
    console.log('=====================================')
    
    for (const result of results) {
      console.log(`\n🔍 ${result.testName}`)
      console.log(`   Messages: ${result.messageCount}`)
      console.log(`   Render Time: ${result.renderTime.toFixed(2)}ms`)
      console.log(`   Memory Usage: ${(result.memoryUsage / 1024).toFixed(2)}KB`)
      console.log(`   Cache Hit Rate: ${result.cacheHitRate.toFixed(1)}%`)
      console.log(`   Avg Frame Time: ${result.averageFrameTime.toFixed(2)}ms`)
      
      if (result.recommendations.length > 0) {
        console.log(`   Recommendations:`)
        result.recommendations.forEach(rec => console.log(`     • ${rec}`))
      }
    }
    
    // Overall assessment
    const avgRenderTime = results.reduce((sum, r) => sum + r.renderTime, 0) / results.length
    const totalMemory = results.reduce((sum, r) => sum + r.memoryUsage, 0)
    
    console.log('\n🎯 Overall Performance Assessment')
    console.log(`   Average Render Time: ${avgRenderTime.toFixed(2)}ms`)
    console.log(`   Total Memory Usage: ${(totalMemory / 1024).toFixed(2)}KB`)
    
    if (avgRenderTime < 50) {
      console.log('   ✅ Performance is EXCELLENT')
    } else if (avgRenderTime < 100) {
      console.log('   ✅ Performance is GOOD')
    } else {
      console.log('   ⚠️  Performance needs IMPROVEMENT')
    }
  }
  
  // Helper methods
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize
    }
    return 0
  }
  
  private generateRecommendations(metrics: Partial<PerformanceTestResults>): string[] {
    const recommendations: string[] = []
    
    if (metrics.renderTime && metrics.renderTime > 100) {
      recommendations.push('Consider implementing virtualization for large message lists')
    }
    
    if (metrics.memoryUsage && metrics.memoryUsage > 10 * 1024 * 1024) { // 10MB
      recommendations.push('Implement memory cleanup and message limits')
    }
    
    if (metrics.cacheHitRate && metrics.cacheHitRate < 50) {
      recommendations.push('Increase cache size or improve cache hit rate')
    }
    
    if (metrics.averageFrameTime && metrics.averageFrameTime > 16) {
      recommendations.push('Optimize rendering to maintain 60fps')
    }
    
    return recommendations
  }
  
  private generateStreamingRecommendations(totalTime: number, efficiency: number): string[] {
    const recommendations: string[] = []
    
    if (totalTime > 1000) {
      recommendations.push('Streaming is taking too long - consider larger chunks')
    }
    
    if (efficiency < 80) {
      recommendations.push('Improve chunking efficiency by adjusting boundaries')
    }
    
    return recommendations
  }
  
  private generateCacheRecommendations(hitRate: number, stats: any): string[] {
    const recommendations: string[] = []
    
    if (hitRate < 70) {
      recommendations.push('Cache hit rate is low - consider increasing cache size')
    }
    
    if (stats.totalSize > 1000) {
      recommendations.push('Cache is getting large - implement cleanup policies')
    }
    
    return recommendations
  }
  
  private generateMemoryRecommendations(usage: number, reclaimed: number): string[] {
    const recommendations: string[] = []
    
    if (usage > 50 * 1024 * 1024) { // 50MB
      recommendations.push('Memory usage is high - implement stricter cleanup')
    }
    
    if (reclaimed < usage * 0.5) {
      recommendations.push('Memory cleanup is ineffective - improve cleanup logic')
    }
    
    return recommendations
  }
}

// Global test instance
export const performanceTestSuite = new PerformanceTestSuite()

// Reactive hook for test results
export function usePerformanceTests() {
  const [results, setResults] = createSignal<PerformanceTestResults[]>([])
  const [isRunning, setIsRunning] = createSignal(false)
  
  const runTests = async () => {
    setIsRunning(true)
    try {
      const testResults = await performanceTestSuite.runAllTests()
      setResults(testResults)
    } finally {
      setIsRunning(false)
    }
  }
  
  return {
    results,
    isRunning,
    runTests
  }
}
