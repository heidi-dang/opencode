import { createSignal, createEffect, onCleanup, batch } from "solid-js"
import { performanceStore } from "./simple-performance-store"

interface FrozenSubtree {
  id: string
  content: string
  rendered: string
  timestamp: number
  dependencies: Set<string>
  isFrozen: boolean
}

interface FreezeOptions {
  maxAge: number        // Maximum age before unfreeze (ms)
  maxSubtrees: number   // Maximum frozen subtrees per message
  freezeThreshold: number // Minimum size to consider freezing
}

class SubtreeFreezer {
  private frozenSubtrees = new Map<string, FrozenSubtree>()
  private messageSubtrees = new Map<string, Set<string>>() // messageId -> subtreeIds
  private options: FreezeOptions
  private cleanupTimer: number | null = null
  
  constructor(options: Partial<FreezeOptions> = {}) {
    this.options = {
      maxAge: 5 * 60 * 1000,        // 5 minutes
      maxSubtrees: 50,              // 50 subtrees per message max
      freezeThreshold: 500,         // 500 characters minimum
      ...options
    }
    
    // Start cleanup timer
    this.startCleanupTimer()
  }
  
  // Check if a subtree should be frozen
  shouldFreeze(messageId: string, partId: string, content: string): boolean {
    const subtreeId = `${messageId}:${partId}`
    
    // Don't freeze if content is too small
    if (content.length < this.options.freezeThreshold) {
      return false
    }
    
    // Don't freeze if already frozen
    if (this.frozenSubtrees.has(subtreeId)) {
      return false
    }
    
    // Check message subtree limit
    const messageSubtrees = this.messageSubtrees.get(messageId)
    if (messageSubtrees && messageSubtrees.size >= this.options.maxSubtrees) {
      return false
    }
    
    // Check if message is completed
    const message = performanceStore.getMessage(messageId)
    const part = performanceStore.getPart(partId)
    
    return !!(message?.completed && part?.completed)
  }
  
  // Freeze a subtree
  freezeSubtree(messageId: string, partId: string, content: string, rendered: string): void {
    const subtreeId = `${messageId}:${partId}`
    
    if (!this.shouldFreeze(messageId, partId, content)) {
      return
    }
    
    const frozenSubtree: FrozenSubtree = {
      id: subtreeId,
      content,
      rendered,
      timestamp: Date.now(),
      dependencies: new Set(),
      isFrozen: true
    }
    
    // Store frozen subtree
    this.frozenSubtrees.set(subtreeId, frozenSubtree)
    
    // Update message subtree index
    const messageSubtrees = this.messageSubtrees.get(messageId) || new Set()
    messageSubtrees.add(subtreeId)
    this.messageSubtrees.set(messageId, messageSubtrees)
    
    // Emit freeze event
    this.emitFreezeEvent(subtreeId, frozenSubtree)
  }
  
  // Get frozen subtree
  getFrozenSubtree(messageId: string, partId: string): FrozenSubtree | undefined {
    const subtreeId = `${messageId}:${partId}`
    const subtree = this.frozenSubtrees.get(subtreeId)
    
    // Check if still valid
    if (subtree && this.isValid(subtree)) {
      return subtree
    }
    
    // Remove invalid subtree
    if (subtree) {
      this.unfreezeSubtree(messageId, partId)
    }
    
    return undefined
  }
  
  // Unfreeze a subtree
  unfreezeSubtree(messageId: string, partId: string): void {
    const subtreeId = `${messageId}:${partId}`
    
    this.frozenSubtrees.delete(subtreeId)
    
    const messageSubtrees = this.messageSubtrees.get(messageId)
    if (messageSubtrees) {
      messageSubtrees.delete(subtreeId)
      if (messageSubtrees.size === 0) {
        this.messageSubtrees.delete(messageId)
      }
    }
    
    // Emit unfreeze event
    this.emitUnfreezeEvent(subtreeId)
  }
  
  // Check if frozen subtree is still valid
  private isValid(subtree: FrozenSubtree): boolean {
    // Check age
    if (Date.now() - subtree.timestamp > this.options.maxAge) {
      return false
    }
    
    // Check if message/part still exists and is completed
    const [messageId, partId] = subtree.id.split(':')
    const message = performanceStore.getMessage(messageId)
    const part = performanceStore.getPart(partId)
    
    return !!(message?.completed && part?.completed && part.content === subtree.content)
  }
  
  // Cleanup old frozen subtrees
  private cleanup(): void {
    const now = Date.now()
    const toRemove: string[] = []
    
    for (const [subtreeId, subtree] of this.frozenSubtrees.entries()) {
      if (now - subtree.timestamp > this.options.maxAge || !this.isValid(subtree)) {
        toRemove.push(subtreeId)
      }
    }
    
    for (const subtreeId of toRemove) {
      const [messageId, partId] = subtreeId.split(':')
      this.unfreezeSubtree(messageId, partId)
    }
  }
  
  // Start cleanup timer
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, 60000) // Cleanup every minute
  }
  
  // Stop cleanup timer
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
  
  // Emit freeze event
  private emitFreezeEvent(subtreeId: string, subtree: FrozenSubtree): void {
    const event = new CustomEvent('subtreeFrozen', {
      detail: { subtreeId, subtree }
    })
    window.dispatchEvent(event)
  }
  
  // Emit unfreeze event
  private emitUnfreezeEvent(subtreeId: string): void {
    const event = new CustomEvent('subtreeUnfrozen', {
      detail: { subtreeId }
    })
    window.dispatchEvent(event)
  }
  
  // Get statistics
  getStats() {
    return {
      totalFrozen: this.frozenSubtrees.size,
      messagesWithFrozen: this.messageSubtrees.size,
      averageSubtreesPerMessage: this.messageSubtrees.size > 0 ? 
        Array.from(this.messageSubtrees.values()).reduce((sum, set) => sum + set.size, 0) / this.messageSubtrees.size : 0
    }
  }
  
  // Clear all frozen subtrees
  clear(): void {
    this.frozenSubtrees.clear()
    this.messageSubtrees.clear()
  }
}

// Reactive component for frozen subtrees
interface FrozenSubtreeProps {
  messageId: string
  partId: string
  content: string
  renderFunction: (content: string) => string
}

function FrozenSubtreeComponent(props: FrozenSubtreeProps): JSX.Element {
  const [isFrozen, setIsFrozen] = createSignal(false)
  const [frozenContent, setFrozenContent] = createSignal('')
  const subtreeId = () => `${props.messageId}:${props.partId}`
  
  // Check for existing frozen subtree
  createEffect(() => {
    const frozen = subtreeFreezer.getFrozenSubtree(props.messageId, props.partId)
    if (frozen) {
      setIsFrozen(true)
      setFrozenContent(frozen.rendered)
    } else {
      setIsFrozen(false)
      // Render fresh content
      const rendered = props.renderFunction(props.content)
      setFrozenContent(rendered)
      
      // Consider freezing if conditions are met
      if (subtreeFreezer.shouldFreeze(props.messageId, props.partId, props.content)) {
        subtreeFreezer.freezeSubtree(props.messageId, props.partId, props.content, rendered)
      }
    }
  })
  
  // Listen to freeze/unfreeze events
  createEffect(() => {
    const handleFreeze = (event: CustomEvent) => {
      if (event.detail.subtreeId === subtreeId()) {
        setIsFrozen(true)
        setFrozenContent(event.detail.subtree.rendered)
      }
    }
    
    const handleUnfreeze = (event: CustomEvent) => {
      if (event.detail.subtreeId === subtreeId()) {
        setIsFrozen(false)
        const rendered = props.renderFunction(props.content)
        setFrozenContent(rendered)
      }
    }
    
    window.addEventListener('subtreeFrozen', handleFreeze as EventListener)
    window.addEventListener('subtreeUnfrozen', handleUnfreeze as EventListener)
    
    onCleanup(() => {
      window.removeEventListener('subtreeFrozen', handleFreeze as EventListener)
      window.removeEventListener('subtreeUnfrozen', handleUnfreeze as EventListener)
    })
  })
  
  return (
    <div 
      data-frozen-subtree={subtreeId()}
      data-is-frozen={isFrozen()}
      class="frozen-subtree"
      style={{
        'contain': isFrozen() ? 'layout paint style' : 'layout',
        'content-visibility': isFrozen() ? 'auto' : 'visible'
      }}
    >
      <div innerHTML={frozenContent()} />
    </div>
  )
}

// Enhanced message component with subtree freezing
interface EnhancedMessageProps {
  messageId: string
  renderPart: (part: any) => JSX.Element
}

function EnhancedMessageComponent(props: EnhancedMessageProps): JSX.Element {
  const message = () => performanceStore.getMessage(props.messageId)
  const parts = () => performanceStore.getMessageParts(props.messageId)
  
  return (
    <div data-message-id={props.messageId} class="enhanced-message">
      <For each={parts()}>
        {(part) => (
          <div data-part-id={part.id} class="message-part">
            {part.type === 'text' && part.content ? (
              <FrozenSubtreeComponent
                messageId={props.messageId}
                partId={part.id}
                content={part.content}
                renderFunction={(content) => {
                  // Simple text rendering
                  return content.replace(/\n/g, '<br>')
                }}
              />
            ) : (
              // Non-text parts (tools, etc.) are rendered normally
              props.renderPart(part)
            )}
          </div>
        )}
      </For>
    </div>
  )
}

// Global subtree freezer instance
export const subtreeFreezer = new SubtreeFreezer()

// Reactive hooks
export function useFrozenSubtree(messageId: string, partId: string) {
  const [isFrozen, setIsFrozen] = createSignal(false)
  const [frozenContent, setFrozenContent] = createSignal('')
  
  createEffect(() => {
    const frozen = subtreeFreezer.getFrozenSubtree(messageId, partId)
    if (frozen) {
      setIsFrozen(true)
      setFrozenContent(frozen.rendered)
    } else {
      setIsFrozen(false)
      setFrozenContent('')
    }
  })
  
  return { isFrozen, frozenContent }
}

export function useSubtreeFreezerStats() {
  const [stats, setStats] = createSignal(subtreeFreezer.getStats())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStats(subtreeFreezer.getStats())
    }, 5000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return stats
}

// Auto-freeze completed content
export function useAutoFreeze(sessionId: string) {
  createEffect(() => {
    const messages = performanceStore.getSessionMessages(sessionId)
    
    // Check completed messages for potential freezing
    for (const message of messages) {
      if (!message.completed) continue
      
      const parts = performanceStore.getMessageParts(message.id)
      for (const part of parts) {
        if (!part.completed || part.type !== 'text' || !part.content) continue
        
        // Auto-freeze if conditions are met
        if (subtreeFreezer.shouldFreeze(message.id, part.id, part.content)) {
          const rendered = part.content.replace(/\n/g, '<br>')
          subtreeFreezer.freezeSubtree(message.id, part.id, part.content, rendered)
        }
      }
    }
  })
}

export { FrozenSubtreeComponent, EnhancedMessageComponent }
