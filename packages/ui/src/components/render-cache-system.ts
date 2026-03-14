import { createSignal, createEffect } from "solid-js"

// Content hash cache for expensive renders
interface RenderCache {
  markdown: Map<string, { html: string; timestamp: number }>
  syntaxHighlight: Map<string, { highlighted: string; timestamp: number }>
  diffRender: Map<string, { rendered: string; timestamp: number }>
}

interface RenderPipeline {
  renderPlainText(content: string): string
  renderBasicMarkdown(content: string): string
  renderFullRich(content: string): string
}

enum RenderState {
  PLAIN_TEXT = 'plain-text',
  BASIC_MARKDOWN = 'basic-markdown',
  FULL_RICH = 'full-rich'
}

class ContentHashCache {
  private cache: RenderCache = {
    markdown: new Map(),
    syntaxHighlight: new Map(),
    diffRender: new Map()
  }
  
  private maxAge = 300000 // 5 minutes
  private maxCacheSize = 1000 // Max items per cache type

  // Generate content hash
  generateHash(content: string, type: string): string {
    return `${type}:${this.simpleHash(content)}`
  }

  // Simple hash function
  private simpleHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  // Check if cache entry is fresh
  private isFresh(timestamp: number): boolean {
    return Date.now() - timestamp < this.maxAge
  }

  // Cleanup old entries
  private cleanup(cache: Map<string, any>): void {
    if (cache.size <= this.maxCacheSize) return
    
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    
    // Remove oldest 25% of entries
    const toRemove = Math.floor(entries.length * 0.25)
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0])
    }
  }

  // Cache markdown render
  cacheMarkdown(content: string): string | null {
    this.cleanup(this.cache.markdown)
    
    const hash = this.generateHash(content, 'markdown')
    const cached = this.cache.markdown.get(hash)
    
    if (cached && this.isFresh(cached.timestamp)) {
      return cached.html
    }
    
    return null
  }

  // Store markdown render
  storeMarkdown(content: string, html: string): void {
    const hash = this.generateHash(content, 'markdown')
    this.cache.markdown.set(hash, {
      html,
      timestamp: Date.now()
    })
  }

  // Cache syntax highlight
  cacheSyntaxHighlight(content: string, language: string): string | null {
    this.cleanup(this.cache.syntaxHighlight)
    
    const hash = this.generateHash(`${content}:${language}`, 'syntax')
    const cached = this.cache.syntaxHighlight.get(hash)
    
    if (cached && this.isFresh(cached.timestamp)) {
      return cached.highlighted
    }
    
    return null
  }

  // Store syntax highlight
  storeSyntaxHighlight(content: string, language: string, highlighted: string): void {
    const hash = this.generateHash(`${content}:${language}`, 'syntax')
    this.cache.syntaxHighlight.set(hash, {
      highlighted,
      timestamp: Date.now()
    })
  }

  // Get cache stats
  getStats() {
    return {
      markdown: this.cache.markdown.size,
      syntaxHighlight: this.cache.syntaxHighlight.size,
      diffRender: this.cache.diffRender.size,
      totalSize: this.cache.markdown.size + this.cache.syntaxHighlight.size + this.cache.diffRender.size
    }
  }

  // Clear all caches
  clear(): void {
    this.cache.markdown.clear()
    this.cache.syntaxHighlight.clear()
    this.cache.diffRender.clear()
  }
}

class SmartRenderer {
  constructor(private cache: ContentHashCache) {}

  render(content: string, isStreaming: boolean, isComplete: boolean): string {
    // Check cache first for completed content
    if (isComplete) {
      const cached = this.cache.cacheMarkdown(content)
      if (cached) return cached
    }
    
    // Choose rendering strategy based on state
    if (isStreaming) {
      return this.renderPlainText(content)
    } else if (isComplete) {
      const rendered = this.renderFullRich(content)
      this.cache.storeMarkdown(content, rendered)
      return rendered
    } else {
      return this.renderBasicMarkdown(content)
    }
  }

  private renderPlainText(content: string): string {
    // Escape HTML and preserve line breaks
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }

  private renderBasicMarkdown(content: string): string {
    // Simple markdown: bold, italic, code blocks, links
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>')
  }

  private renderFullRich(content: string): string {
    // Full markdown parsing (simplified version)
    let html = content
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')
    
    // Bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
    
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const highlighted = this.highlightSyntax(code, lang || '')
      return `<pre><code class="language-${lang || 'text'}">${highlighted}</code></pre>`
    })
    
    // Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>')
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    
    // Line breaks
    html = html.replace(/\n/g, '<br>')
    
    return html
  }

  private highlightSyntax(code: string, language: string): string {
    // Check cache first
    const cached = this.cache.cacheSyntaxHighlight(code, language)
    if (cached) return cached
    
    // Simple syntax highlighting (placeholder - in real implementation, use Prism or highlight.js)
    let highlighted = code
    
    // Basic syntax highlighting patterns
    if (language === 'javascript' || language === 'js') {
      highlighted = highlighted
        .replace(/\b(function|const|let|var|if|else|for|while|return|class|extends)\b/g, '<span class="keyword">$1</span>')
        .replace(/\b(true|false|null|undefined)\b/g, '<span class="boolean">$1</span>')
        .replace(/\b\d+\b/g, '<span class="number">$&</span>')
        .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="string">$&</span>')
    }
    
    // Store in cache
    this.cache.storeSyntaxHighlight(code, language, highlighted)
    
    return highlighted
  }
}

class ContentAnalyzer {
  isStable(content: string, previousContent: string): boolean {
    // Content is stable if it hasn't changed much or has completion markers
    const hasCompletionMarkers = /\.$|```|[\]}]/.test(content)
    const isLongEnough = content.length > 100
    const minimalChange = Math.abs(content.length - previousContent.length) < 10
    
    return (hasCompletionMarkers && isLongEnough) || minimalChange
  }

  isComplete(content: string): boolean {
    // Look for completion indicators
    const completionPatterns = [
      /```\s*$/,           // Closed code block
      /\.$/,               // Ends with period
      /[\]}]\s*$/,        // Closed brackets
      /:\s*$/,             // Ends with colon (lists)
      /\n\s*\n\s*$/       // Multiple newlines (end of section)
    ]
    
    return completionPatterns.some(pattern => pattern.test(content))
  }
}

class RenderStateMachine {
  private state = RenderState.PLAIN_TEXT
  private lastUpgradeTime = 0
  private stabilityTimer: number | null = null

  update(content: string, isStreaming: boolean): RenderState {
    const now = Date.now()
    
    if (!isStreaming) {
      // Content is complete, upgrade to full rich
      this.state = RenderState.FULL_RICH
      return this.state
    }
    
    if (this.state === RenderState.PLAIN_TEXT && content.length > 50) {
      // Upgrade to basic markdown after some content
      this.state = RenderState.BASIC_MARKDOWN
      this.lastUpgradeTime = now
    }
    
    if (this.state === RenderState.BASIC_MARKDOWN && 
        now - this.lastUpgradeTime > 2000) {
      // Upgrade to full rich if stable for 2 seconds
      this.state = RenderState.FULL_RICH
    }
    
    return this.state
  }
}

// Global instances
export const contentCache = new ContentHashCache()
export const smartRenderer = new SmartRenderer(contentCache)
export const contentAnalyzer = new ContentAnalyzer()
export const renderStateMachine = new RenderStateMachine()

// Reactive hooks
export function useCachedRender(content: () => string, isStreaming: () => boolean, isComplete: () => boolean) {
  const [renderedContent, setRenderedContent] = createSignal('')
  
  createEffect(() => {
    const contentValue = content()
    const streamingValue = isStreaming()
    const completeValue = isComplete()
    
    const rendered = smartRenderer.render(contentValue, streamingValue, completeValue)
    setRenderedContent(rendered)
  })
  
  return renderedContent
}

export function useSyntaxHighlight(code: () => string, language: () => string) {
  const [highlightedCode, setHighlightedCode] = createSignal('')
  
  createEffect(() => {
    const codeValue = code()
    const languageValue = language()
    
    const cached = contentCache.cacheSyntaxHighlight(codeValue, languageValue)
    if (cached) {
      setHighlightedCode(cached)
    } else {
      const highlighted = smartRenderer['highlightSyntax'](codeValue, languageValue)
      setHighlightedCode(highlighted)
    }
  })
  
  return highlightedCode
}

// Performance monitoring
export function getRenderCacheStats() {
  return contentCache.getStats()
}

export function clearRenderCache() {
  contentCache.clear()
}
