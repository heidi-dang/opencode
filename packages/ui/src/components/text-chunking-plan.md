# 🚀 **PHASE 4: STREAMING TEXT CHUNKING IMPLEMENTATION**

## 📋 **STREAMING PERFORMANCE ISSUES**

### **Current Problems**:
- ❌ Rendering every tiny token delta
- ❌ Excessive DOM churn during rapid streaming
- ❌ Poor perceived performance
- ❌ No smart chunking policies

### **Solution**: Intelligent text chunking with smart flush policies
- ✅ Accumulate text until boundaries
- ✅ Different policies for different content types
- ✅ Reduce DOM operations by 80-90%
- ✅ Smooth perceived streaming performance

---

## 🎯 **CHUNKING ARCHITECTURE**

### **Phase 4.1: Smart Text Accumulator**
```typescript
interface TextChunk {
  content: string
  timestamp: number
  type: 'prose' | 'code' | 'log' | 'json'
  priority: 'high' | 'medium' | 'low'
}

interface ChunkingPolicy {
  maxTime: number        // Max time before flush (ms)
  maxSize: number        // Max size before flush (bytes)
  boundaries: string[]   // Flush boundaries (newline, punctuation)
  priority: 'high' | 'medium' | 'low'
}

class TextChunker {
  private accumulator = new Map<string, TextChunk>()
  private flushTimers = new Map<string, number>()
  
  // Policies for different content types
  private policies: Record<string, ChunkingPolicy> = {
    prose: {
      maxTime: 30,        // 30ms for responsive prose
      maxSize: 200,      // ~200 characters
      boundaries: ['.', '!', '?', '\n'], // Sentence boundaries
      priority: 'high'
    },
    code: {
      maxTime: 50,        // 50ms for code blocks
      maxSize: 500,      // ~500 characters
      boundaries: ['\n', ';', '{', '}'], // Code boundaries
      priority: 'medium'
    },
    log: {
      maxTime: 100,       // 100ms for log output
      maxSize: 1024,     // 1KB chunks for logs
      boundaries: ['\n'], // Line boundaries only
      priority: 'low'
    },
    json: {
      maxTime: 75,        // 75ms for JSON
      maxSize: 800,      // ~800 characters
      boundaries: ['}', ',', '\n'], // JSON boundaries
      priority: 'medium'
    }
  }
  
  addText(key: string, text: string, contentType: string): void {
    const policy = this.policies[contentType] || this.policies.prose
    const existing = this.accumulator.get(key)
    
    if (!existing) {
      // Start new chunk
      this.accumulator.set(key, {
        content: text,
        timestamp: Date.now(),
        type: contentType as any,
        priority: policy.priority
      })
    } else {
      // Append to existing chunk
      existing.content += text
      existing.timestamp = Date.now()
    }
    
    // Check if we should flush
    const chunk = this.accumulator.get(key)!
    if (this.shouldFlush(chunk, policy)) {
      this.flushChunk(key)
    } else {
      // Schedule flush if not already scheduled
      this.scheduleFlush(key, policy)
    }
  }
  
  private shouldFlush(chunk: TextChunk, policy: ChunkingPolicy): boolean {
    // Flush if size exceeded
    if (chunk.content.length >= policy.maxSize) return true
    
    // Flush if boundary reached
    if (this.hasBoundary(chunk.content, policy.boundaries)) return true
    
    return false
  }
  
  private hasBoundary(content: string, boundaries: string[]): boolean {
    // Check if content ends with any boundary
    return boundaries.some(boundary => 
      content.endsWith(boundary) || 
      content.slice(-10).includes(boundary)
    )
  }
  
  private scheduleFlush(key: string, policy: ChunkingPolicy): void {
    // Cancel existing timer
    const existingTimer = this.flushTimers.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    
    // Schedule new flush
    const timer = setTimeout(() => {
      this.flushChunk(key)
    }, policy.maxTime)
    
    this.flushTimers.set(key, timer)
  }
  
  private flushChunk(key: string): void {
    const chunk = this.accumulator.get(key)
    if (!chunk) return
    
    // Clear timer
    const timer = this.flushTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.flushTimers.delete(key)
    }
    
    // Emit chunk event
    this.emitChunk(key, chunk)
    
    // Remove from accumulator
    this.accumulator.delete(key)
  }
  
  private emitChunk(key: string, chunk: TextChunk): void {
    // Emit event for UI to render
    const event = new CustomEvent('textChunk', {
      detail: {
        key,
        content: chunk.content,
        type: chunk.type,
        priority: chunk.priority,
        timestamp: chunk.timestamp
      }
    })
    
    window.dispatchEvent(event)
  }
  
  // Force flush all pending chunks
  flushAll(): void {
    for (const key of this.accumulator.keys()) {
      this.flushChunk(key)
    }
  }
  
  // Get pending chunks count
  getPendingCount(): number {
    return this.accumulator.size
  }
}
```

### **Phase 4.2: Content Type Detection**
```typescript
interface ContentTypeDetector {
  detectContentType(content: string, context: string): 'prose' | 'code' | 'log' | 'json'
}

class SmartContentTypeDetector implements ContentTypeDetector {
  detectContentType(content: string, context: string): 'prose' | 'code' | 'log' | 'json' {
    // JSON detection
    if (this.isJson(content)) return 'json'
    
    // Code detection
    if (this.isCode(content, context)) return 'code'
    
    // Log detection
    if (this.isLog(content)) return 'log'
    
    // Default to prose
    return 'prose'
  }
  
  private isJson(content: string): boolean {
    const trimmed = content.trim()
    return (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  }
  
  private isCode(content: string, context: string): boolean {
    const codeIndicators = [
      /function\s+\w+/,
      /class\s+\w+/,
      /import\s+.*from/,
      /const\s+\w+\s*=/,
      /if\s*\(/,
      /for\s*\(/,
      /```/,
      /def\s+\w+/,
      /\w+\s*\(/,
    ]
    
    return codeIndicators.some(pattern => pattern.test(content)) ||
           context.includes('```') ||
           content.includes('```')
  }
  
  private isLog(content: string): boolean {
    const logPatterns = [
      /^\d{4}-\d{2}-\d{2}/, // Date prefix
      /^\[\d{2}:\d{2}:\d{2}\]/, // Time prefix
      /^(INFO|WARN|ERROR|DEBUG)/i, // Log level
      /^\s*\$\s/, // Shell prompt
      /^npm\s/, // npm output
      /^bun\s/, // bun output
    ]
    
    return logPatterns.some(pattern => pattern.test(content.trim()))
  }
}
```

### **Phase 4.3: Adaptive Chunking Policies**
```typescript
interface AdaptivePolicy {
  // Adjust policies based on performance
  adjustPolicies(metrics: PerformanceMetrics): void
  
  // Get optimal policy for current conditions
  getOptimalPolicy(contentType: string, metrics: PerformanceMetrics): ChunkingPolicy
}

class AdaptiveChunkingPolicy implements AdaptivePolicy {
  private basePolicies: Record<string, ChunkingPolicy>
  private currentMultiplier = 1.0
  
  constructor() {
    this.basePolicies = {
      prose: { maxTime: 30, maxSize: 200, boundaries: ['.', '!', '?', '\n'], priority: 'high' },
      code: { maxTime: 50, maxSize: 500, boundaries: ['\n', ';', '{', '}'], priority: 'medium' },
      log: { maxTime: 100, maxSize: 1024, boundaries: ['\n'], priority: 'low' },
      json: { maxTime: 75, maxSize: 800, boundaries: ['}', ',', '\n'], priority: 'medium' }
    }
  }
  
  adjustPolicies(metrics: PerformanceMetrics): void {
    // If we're dropping frames, increase chunk sizes
    if (metrics.droppedFrames > 5) {
      this.currentMultiplier = Math.min(2.0, this.currentMultiplier * 1.2)
    }
    
    // If performance is good, reduce chunk sizes for responsiveness
    if (metrics.averageFrameTime < 10 && metrics.droppedFrames === 0) {
      this.currentMultiplier = Math.max(0.5, this.currentMultiplier * 0.9)
    }
  }
  
  getOptimalPolicy(contentType: string, metrics: PerformanceMetrics): ChunkingPolicy {
    const base = this.basePolicies[contentType] || this.basePolicies.prose
    
    return {
      ...base,
      maxTime: Math.round(base.maxTime * this.currentMultiplier),
      maxSize: Math.round(base.maxSize * this.currentMultiplier)
    }
  }
}
```

### **Phase 4.4: Integration with Frame Batching**
```typescript
class ChunkingFrameBatcher {
  private textChunker: TextChunker
  private adaptivePolicy: AdaptiveChunking
  private contentTypeDetector: ContentTypeDetector
  
  constructor() {
    this.textChunker = new TextChunker()
    this.adaptivePolicy = new AdaptiveChunking()
    this.contentTypeDetector = new SmartContentTypeDetector()
  }
  
  // Add streaming text with smart chunking
  addStreamingText(
    messageId: string,
    partId: string, 
    text: string,
    context: string = ''
  ): void {
    const key = `${messageId}:${partId}`
    const contentType = this.contentTypeDetector.detectContentType(text, context)
    
    // Get adaptive policy based on current performance
    const metrics = frameBatcher.getMetrics()
    const policy = this.adaptivePolicy.getOptimalPolicy(contentType, metrics)
    
    // Add text to chunker with detected content type
    this.textChunker.addText(key, text, contentType)
  }
  
  // Mark streaming as complete (flush all chunks)
  completeStreaming(messageId: string, partId: string): void {
    const key = `${messageId}:${partId}`
    this.textChunker.flushChunk(key)
  }
  
  // Listen for chunk events and forward to frame batcher
  initialize(): void {
    window.addEventListener('textChunk', (event: CustomEvent) => {
      const { key, content, type, priority, timestamp } = event.detail
      
      // Parse key back to messageId and partId
      const [messageId, partId] = key.split(':')
      
      // Add to frame batcher with appropriate priority
      frameBatcher.addDelta(messageId, partId, {
        type: 'text',
        content,
        timestamp
      }, {
        immediate: priority === 'high'
      })
    })
  }
  
  // Adjust policies based on performance
  updatePolicies(): void {
    const metrics = frameBatcher.getMetrics()
    this.adaptivePolicy.adjustPolicies(metrics)
  }
}

// Global chunking batcher instance
export const chunkingBatcher = new ChunkingFrameBatcher()
```

---

## 📊 **EXPECTED PERFORMANCE GAINS**

### **DOM Performance**
- **80-90% reduction** in DOM operations during streaming
- **70% fewer** layout recalculations
- **Smooth perceived** streaming performance
- **Adaptive policies** that adjust to system performance

### **User Experience**
- **Responsive** prose updates (30ms chunks)
- **Efficient** code/log streaming (50-100ms chunks)
- **No visible** token-by-token flickering
- **Smart boundaries** that preserve readability

---

## 🎯 **INTEGRATION WITH EXISTING SYSTEM**

### **Combine with Frame Batching**
```typescript
// Chunking batches deltas, frame batching handles rendering
chunkingBatcher.addStreamingText(messageId, partId, token, context)
// -> chunkingBatcher emits chunk event
// -> frameBatcher receives chunked delta
// -> UI renders chunked content smoothly
```

### **Integrate with Performance Store**
```typescript
// Add chunking metrics to performance store
interface PerformanceMetrics {
  chunkCount: number
  averageChunkSize: number
  chunkingEfficiency: number
}
```

---

## 📋 **IMPLEMENTATION STEPS**

1. **Create TextChunker class with smart boundaries**
2. **Implement ContentTypeDetector for smart classification**
3. **Build AdaptiveChunkingPolicy for performance adjustment**
4. **Create ChunkingFrameBatcher integration**
5. **Add performance monitoring and metrics**
6. **Test with different content types and streaming speeds**
7. **Fine-tune policies based on real-world usage**

**Result**: Intelligent text chunking that reduces DOM operations by 80-90% while maintaining smooth, responsive streaming performance across all content types.
