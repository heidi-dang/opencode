import { createSignal, createEffect, onCleanup, For, Show, type JSX } from "solid-js"

interface OutputSummary {
  originalLength: number
  collapsedLength: number
  lineCount: number
  type: 'text' | 'code' | 'json' | 'log' | 'error'
  summary: string
  keyLines: string[]
  hasBeenCollapsed: boolean
}

interface CollapseOptions {
  maxLines?: number         // Maximum lines before collapsing
  maxChars?: number         // Maximum characters before collapsing
  preserveKeyLines?: boolean // Preserve important lines
  showLineNumbers?: boolean // Show line numbers in collapsed view
  enableExpansion?: boolean // Allow manual expansion
}

interface ToolOutputProps {
  content: string
  toolName?: string
  status?: 'running' | 'completed' | 'error'
  options?: CollapseOptions
  onToggle?: (expanded: boolean) => void
}

class OutputCollapser {
  private defaultOptions: CollapseOptions = {
    maxLines: 50,
    maxChars: 5000,
    preserveKeyLines: true,
    showLineNumbers: true,
    enableExpansion: true
  }
  
  // Detect content type
  private detectContentType(content: string): 'text' | 'code' | 'json' | 'log' | 'error' {
    const trimmed = content.trim()
    
    // Error detection
    if (trimmed.includes('ERROR') || trimmed.includes('Error:') || trimmed.includes('error:')) {
      return 'error'
    }
    
    // JSON detection
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return 'json'
    }
    
    // Code detection
    if (trimmed.includes('```') || 
        trimmed.includes('function') || 
        trimmed.includes('const ') || 
        trimmed.includes('import ') ||
        trimmed.includes('def ') ||
        trimmed.includes('class ')) {
      return 'code'
    }
    
    // Log detection
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) ||
        /^\[\d{2}:\d{2}:\d{2}\]/.test(trimmed) ||
        /^(INFO|WARN|ERROR|DEBUG)/i.test(trimmed)) {
      return 'log'
    }
    
    return 'text'
  }
  
  // Extract key lines that should be preserved
  private extractKeyLines(content: string, contentType: string): string[] {
    const lines = content.split('\n')
    const keyLines: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (contentType === 'error') {
        // Preserve error messages and stack traces
        if (line.includes('Error:') || 
            line.includes('ERROR') ||
            line.includes('at ') ||
            line.match(/^\d+:\d+/)) {
          keyLines.push(lines[i])
        }
      } else if (contentType === 'log') {
        // Preserve log levels and timestamps
        if (/^(INFO|WARN|ERROR|DEBUG)/i.test(line) ||
            /^\d{4}-\d{2}-\d{2}/.test(line) ||
            /^\[\d{2}:\d{2}:\d{2}\]/.test(line)) {
          keyLines.push(lines[i])
        }
      } else if (contentType === 'json') {
        // Preserve JSON structure indicators
        if (line.includes('{') || line.includes('}') || 
            line.includes('[') || line.includes(']') ||
            line.trim().endsWith(':')) {
          keyLines.push(lines[i])
        }
      } else if (contentType === 'code') {
        // Preserve function definitions and imports
        if (line.includes('function') || line.includes('const ') ||
            line.includes('import ') || line.includes('def ') ||
            line.includes('class ') || line.includes('export ')) {
          keyLines.push(lines[i])
        }
      } else {
        // For text, preserve lines that start with common patterns
        if (/^(#+|-|\*|\d+\.)/.test(line) || line.length < 100) {
          keyLines.push(lines[i])
        }
      }
      
      // Limit key lines to prevent too much content
      if (keyLines.length >= 10) break
    }
    
    return keyLines
  }
  
  // Generate summary of content
  private generateSummary(content: string, contentType: string): string {
    const lines = content.split('\n')
    const lineCount = lines.length
    const charCount = content.length
    
    if (contentType === 'error') {
      return `Error output (${lineCount} lines, ${charCount} chars)`
    } else if (contentType === 'json') {
      return `JSON data (${lineCount} lines, ${charCount} chars)`
    } else if (contentType === 'code') {
      return `Code block (${lineCount} lines, ${charCount} chars)`
    } else if (contentType === 'log') {
      return `Log output (${lineCount} lines, ${charCount} chars)`
    } else {
      return `Text output (${lineCount} lines, ${charCount} chars)`
    }
  }
  
  // Collapse content
  collapse(content: string, options: CollapseOptions): OutputSummary {
    const opts = { ...this.defaultOptions, ...options }
    const contentType = this.detectContentType(content)
    const lines = content.split('\n')
    const lineCount = lines.length
    const charCount = content.length
    
    // Check if content needs collapsing
    const shouldCollapse = lineCount > (opts.maxLines ?? 50) || charCount > (opts.maxChars ?? 5000)
    
    if (!shouldCollapse) {
      return {
        originalLength: charCount,
        collapsedLength: charCount,
        lineCount,
        type: contentType,
        summary: this.generateSummary(content, contentType),
        keyLines: lines,
        hasBeenCollapsed: false
      }
    }
    
    // Extract key lines if enabled
    let keyLines: string[] = []
    if (opts.preserveKeyLines) {
      keyLines = this.extractKeyLines(content, contentType)
    }
    
    // Generate collapsed content
    let collapsedContent = ''
    if (keyLines.length > 0) {
      collapsedContent = keyLines.join('\n')
    } else {
      // If no key lines, show first few and last few lines
      const previewLines = Math.min(5, lineCount)
      const firstLines = lines.slice(0, previewLines)
      const lastLines = lines.slice(-previewLines)
      
      collapsedContent = [
        ...firstLines,
        '...',
        ...lastLines
      ].join('\n')
    }
    
    return {
      originalLength: charCount,
      collapsedLength: collapsedContent.length,
      lineCount,
      type: contentType,
      summary: this.generateSummary(content, contentType),
      keyLines: keyLines.length > 0 ? keyLines : [collapsedContent],
      hasBeenCollapsed: true
    }
  }
  
  // Expand collapsed content
  expand(summary: OutputSummary, originalContent: string): OutputSummary {
    return {
      ...summary,
      collapsedLength: originalContent.length,
      keyLines: originalContent.split('\n'),
      hasBeenCollapsed: false
    }
  }
}

// Global output collapser
export const outputCollapser = new OutputCollapser()

// Collapsible tool output component
export function CollapsibleToolOutput(props: ToolOutputProps): JSX.Element {
  const [isExpanded, setIsExpanded] = createSignal(false)
  const [summary, setSummary] = createSignal<OutputSummary | null>(null)
  
  const options = { ...outputCollapser['defaultOptions'], ...props.options }
  
  createEffect(() => {
    const collapsed = outputCollapser.collapse(props.content, options)
    setSummary(collapsed)
  })
  
  const handleToggle = () => {
    const expanded = !isExpanded()
    setIsExpanded(expanded)
    props.onToggle?.(expanded)
  }
  
  const summaryValue = summary()
  const isExpandedValue = isExpanded()
  
  if (!summaryValue) return <div>Loading...</div>
  
  return (
    <div 
      class={`collapsible-output collapsible-${summaryValue.type} ${isExpandedValue ? 'expanded' : 'collapsed'}`}
      data-tool-name={props.toolName}
      data-status={props.status}
    >
      {/* Header with summary and toggle */}
      <div 
        class="output-header"
        style={{
          display: 'flex',
          'justify-content': 'space-between',
          'align-items': 'center',
          padding: '8px 12px',
          'background-color': 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-primary)',
          'border-bottom': summaryValue.hasBeenCollapsed && !isExpandedValue ? '1px solid var(--color-border-primary)' : 'none',
          'border-radius': summaryValue.hasBeenCollapsed && !isExpandedValue ? '4px 4px 0 0' : '4px',
          cursor: summaryValue.hasBeenCollapsed ? 'pointer' : 'default'
        }}
        onClick={summaryValue.hasBeenCollapsed && options.enableExpansion ? handleToggle : undefined}
      >
        <div class="output-summary" style={{
          'font-size': '12px',
          'font-weight': '500',
          color: 'var(--color-text-secondary)'
        }}>
          {props.toolName && <span style={{ 'margin-right': '8px' }}>{props.toolName}</span>}
          {summaryValue.summary}
          {summaryValue.hasBeenCollapsed && (
            <span style={{ 'margin-left': '8px', color: 'var(--color-text-tertiary)' }}>
              (collapsed)
            </span>
          )}
        </div>
        
        {summaryValue.hasBeenCollapsed && options.enableExpansion && (
          <div class="toggle-button" style={{
            'font-size': '12px',
            color: 'var(--color-text-secondary)',
            transition: 'transform 0.2s ease',
            transform: isExpandedValue ? 'rotate(180deg)' : 'rotate(0deg)'
          }}>
            ▼
          </div>
        )}
      </div>
      
      {/* Content area */}
      <div 
        class="output-content"
        style={{
          'background-color': 'var(--color-bg-primary)',
          border: summaryValue.hasBeenCollapsed && !isExpandedValue ? 'none' : '1px solid var(--color-border-primary)',
          'border-top': 'none',
          'border-radius': summaryValue.hasBeenCollapsed && !isExpandedValue ? '0 0 4px 4px' : '0 0 4px 4px',
          overflow: 'hidden',
          'max-height': isExpandedValue ? 'none' : '300px',
          transition: 'max-height 0.3s ease'
        }}
      >
        <pre 
          class={`output-text output-${summaryValue.type}`}
          style={{
            margin: '0',
            padding: '12px',
            'font-size': '12px',
            'line-height': '1.4',
            'white-space': 'pre-wrap',
            'word-break': 'break-word',
            overflow: isExpandedValue ? 'visible' : 'auto',
            'max-height': isExpandedValue ? 'none' : '300px'
          }}
        >
          {options.showLineNumbers && (
            <For each={summaryValue.keyLines}>
              {(line, index) => (
                <div style={{ display: 'flex' }}>
                  <span style={{
                    'margin-right': '12px',
                    color: 'var(--color-text-tertiary)',
                    'user-select': 'none',
                    'min-width': '30px',
                    'text-align': 'right'
                  }}>
                    {index() + 1}
                  </span>
                  <span style={{ flex: 1 }}>{line}</span>
                </div>
              )}
            </For>
          )}
          
          {!options.showLineNumbers && (
            <For each={summaryValue.keyLines}>
              {(line) => <div>{line}</div>}
            </For>
          )}
        </pre>
        
        {/* Show more indicator for collapsed content */}
        {summaryValue.hasBeenCollapsed && !isExpandedValue && summaryValue.originalLength > 1000 && (
          <div 
            class="show-more-indicator"
            style={{
              padding: '8px 12px',
              'background-color': 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-primary)',
              'border-top': 'none',
              'border-radius': '0 0 4px 4px',
              'text-align': 'center',
              'font-size': '12px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer'
            }}
            onClick={handleToggle}
          >
            Show {summaryValue.originalLength - summaryValue.collapsedLength} more characters
          </div>
        )}
      </div>
    </div>
  )
}

// Auto-collapsing tool output wrapper
interface AutoCollapsingOutputProps {
  content: string
  toolName?: string
  status?: 'running' | 'completed' | 'error'
  autoCollapse?: boolean
  forceCollapse?: boolean
}

export function AutoCollapsingOutput(props: AutoCollapsingOutputProps): JSX.Element {
  const [shouldCollapse, setShouldCollapse] = createSignal(false)
  
  createEffect(() => {
    const content = props.content
    const shouldAutoCollapse = props.autoCollapse !== false
    const forceCollapse = props.forceCollapse === true
    
    // Auto-collapse based on content size
    const lines = content.split('\n').length
    const chars = content.length
    
    const needsCollapse = forceCollapse || (shouldAutoCollapse && (lines > 20 || chars > 2000))
    setShouldCollapse(needsCollapse)
  })
  
  const collapseOptions = shouldCollapse() ? {
    maxLines: 10,
    maxChars: 1000,
    preserveKeyLines: true,
    showLineNumbers: false,
    enableExpansion: true
  } : {
    maxLines: 1000,
    maxChars: 100000,
    preserveKeyLines: false,
    showLineNumbers: false,
    enableExpansion: false
  }
  
  return (
    <CollapsibleToolOutput
      content={props.content}
      toolName={props.toolName}
      status={props.status}
      options={collapseOptions}
    />
  )
}

// Batch output processor for multiple tool outputs
interface BatchOutputProcessor {
  processOutputs(outputs: Array<{ content: string; toolName?: string }>): Array<{
    content: string
    toolName?: string
    shouldCollapse: boolean
    summary: OutputSummary
  }>
}

class ToolOutputBatchProcessor implements BatchOutputProcessor {
  processOutputs(outputs: Array<{ content: string; toolName?: string }>) {
    return outputs.map(output => {
      const summary = outputCollapser.collapse(output.content, {
        maxLines: 30,
        maxChars: 3000,
        preserveKeyLines: true,
        showLineNumbers: false,
        enableExpansion: true
      })
      
      return {
        ...output,
        shouldCollapse: summary.hasBeenCollapsed,
        summary
      }
    })
  }
}

// Global batch processor
export const batchOutputProcessor = new ToolOutputBatchProcessor()

// Reactive hook for output statistics
export function useOutputStats(content: () => string) {
  const [stats, setStats] = createSignal({
    lineCount: 0,
    charCount: 0,
    wouldCollapse: false,
    estimatedSavings: 0
  })
  
  createEffect(() => {
    const contentValue = content()
    const lines = contentValue.split('\n')
    const lineCount = lines.length
    const charCount = contentValue.length
    const wouldCollapse = lineCount > 20 || charCount > 2000
    const estimatedSavings = wouldCollapse ? Math.max(0, charCount - 1000) : 0
    
    setStats({
      lineCount,
      charCount,
      wouldCollapse,
      estimatedSavings
    })
  })
  
  return stats
}

// Export types
export type { OutputSummary, CollapseOptions, ToolOutputProps, AutoCollapsingOutputProps, BatchOutputProcessor }
