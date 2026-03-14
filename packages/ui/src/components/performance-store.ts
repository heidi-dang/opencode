import { createSignal, createEffect } from "solid-js"
import { createStore } from "solid-js/store"

// Normalized store structure with O(1) indexes
interface NormalizedStore {
  // Core entities
  messages: Record<string, Message>
  parts: Record<string, Part>
  
  // O(1) indexes for fast lookups
  messageIdsBySession: Record<string, string[]> // sessionId -> messageIds[]
  partIdsByMessage: Record<string, string[]> // messageId -> partIds[]
  
  // Performance indexes
  latestToolBySession: Record<string, ToolInfo> // sessionId -> latest tool
  activeTaskBySession: Record<string, TaskInfo> // sessionId -> active task
  latestStreamingPartBySession: Record<string, PartInfo> // sessionId -> streaming part
  toolPartsByMessage: Record<string, ToolInfo[]> // messageId -> tool parts
  
  // Live tracking
  activeStreamingSessions: Set<string>
  completedSessions: Set<string>
}

interface Message {
  id: string
  sessionId: string
  type: 'user' | 'assistant' | 'system'
  content?: string
  timestamp: number
  completed: boolean
}

interface Part {
  id: string
  messageId: string
  type: 'text' | 'tool' | 'reasoning' | 'file'
  content: string
  status: 'pending' | 'running' | 'completed' | 'error'
  metadata?: Record<string, any>
  streaming: boolean
  completed: boolean
}

interface ToolInfo {
  partId: string
  tool: string
  status: string
  title?: string
  error?: string
  timestamp: number
}

interface TaskInfo {
  partId: string
  sessionId: string
  status: string
  title: string
  timestamp: number
}

interface PartInfo {
  partId: string
  messageId: string
  type: string
  status: string
  streaming: boolean
}

class PerformanceStore {
  private store: NormalizedStore
  private setStore: (store: NormalizedStore) => void

  constructor() {
    const [store, setStore] = createStore<NormalizedStore>({
      messages: {},
      parts: {},
      messageIdsBySession: {},
      partIdsByMessage: {},
      latestToolBySession: {},
      activeTaskBySession: {},
      latestStreamingPartBySession: {},
      toolPartsByMessage: {},
      activeStreamingSessions: new Set() as any,
      completedSessions: new Set() as any
    })
    this.store = store
    this.setStore = setStore
  }

  // Getters with O(1) access
  getMessage(messageId: string): Message | undefined {
    return this.store.messages[messageId]
  }

  getPart(partId: string): Part | undefined {
    return this.store.parts[partId]
  }

  getSessionMessages(sessionId: string): Message[] {
    const messageIds = this.store.messageIdsBySession[sessionId] || []
    return messageIds.map(id => this.store.messages[id]).filter(Boolean)
  }

  getMessageParts(messageId: string): Part[] {
    const partIds = this.store.partIdsByMessage[messageId] || []
    return partIds.map(id => this.store.parts[id]).filter(Boolean)
  }

  // O(1) tool lookups
  getLatestTool(sessionId: string): ToolInfo | undefined {
    return store.latestToolBySession[sessionId]
  }

  getActiveTask(sessionId: string): TaskInfo | undefined {
    return store.activeTaskBySession[sessionId]
  }

  getLatestStreamingPart(sessionId: string): PartInfo | undefined {
    return store.latestStreamingPartBySession[sessionId]
  }

  getToolParts(messageId: string): ToolInfo[] {
    return store.toolPartsByMessage[messageId] || []
  }

  // Mutations with index updates
  addMessage(message: Message) {
    setStore('messages', message.id, message)
    
    // Update session index
    const sessionMessages = store.messageIdsBySession[message.sessionId] || []
    if (!sessionMessages.includes(message.id)) {
      setStore('messageIdsBySession', message.sessionId, [...sessionMessages, message.id])
    }
    
    // Initialize parts index
    if (!store.partIdsByMessage[message.id]) {
      setStore('partIdsByMessage', message.id, [])
    }
  }

  addPart(part: Part) {
    setStore('parts', part.id, part)
    
    // Update message index
    const messageParts = store.partIdsByMessage[part.messageId] || []
    if (!messageParts.includes(part.id)) {
      setStore('partIdsByMessage', part.messageId, [...messageParts, part.id])
    }
    
    // Update tool index if it's a tool part
    if (part.type === 'tool') {
      const toolInfo: ToolInfo = {
        partId: part.id,
        tool: part.metadata?.tool || 'unknown',
        status: part.status,
        title: part.metadata?.title,
        error: part.metadata?.error,
        timestamp: Date.now()
      }
      
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId) {
        setStore('latestToolBySession', sessionId, toolInfo)
        
        const messageTools = store.toolPartsByMessage[part.messageId] || []
        setStore('toolPartsByMessage', part.messageId, [...messageTools, toolInfo])
      }
    }
    
    // Update streaming tracking
    if (part.streaming) {
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId) {
        setStore('latestStreamingPartBySession', sessionId, {
          partId: part.id,
          messageId: part.messageId,
          type: part.type,
          status: part.status,
          streaming: true
        })
        setStore('activeStreamingSessions', sessions => new Set([...sessions, sessionId]))
      }
    }
  }

  updatePart(partId: string, updates: Partial<Part>) {
    const part = store.parts[partId]
    if (!part) return
    
    setStore('parts', partId, updates)
    
    // Update tool index if it's a tool part
    if (part.type === 'tool') {
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId && store.latestToolBySession[sessionId]?.partId === partId) {
        setStore('latestToolBySession', sessionId, {
          ...store.latestToolBySession[sessionId],
          status: updates.status || part.status,
          title: updates.metadata?.title || part.metadata?.title,
          error: updates.metadata?.error || part.metadata?.error,
          timestamp: Date.now()
        })
      }
    }
    
    // Update streaming tracking
    if (updates.streaming === false && part.streaming) {
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId && store.latestStreamingPartBySession[sessionId]?.partId === partId) {
        setStore('latestStreamingPartBySession', sessionId, {
          ...store.latestStreamingPartBySession[sessionId],
          streaming: false,
          status: updates.status || part.status
        })
      }
    }
    
    // Mark completed
    if (updates.completed === true && !part.completed) {
      setStore('parts', partId, 'completed', true)
      
      // Check if all parts in message are completed
      const messageParts = this.getMessageParts(part.messageId)
      const allCompleted = messageParts.every(p => p.completed)
      
      if (allCompleted) {
        const message = this.getMessage(part.messageId)
        if (message) {
          setStore('messages', part.messageId, 'completed', true)
          
          const sessionId = message.sessionId
          if (sessionId) {
            setStore('completedSessions', sessions => new Set([...sessions, sessionId]))
            setStore('activeStreamingSessions', sessions => {
              const newSet = new Set(sessions)
              newSet.delete(sessionId)
              return newSet
            })
          }
        }
      }
    }
  }

  // Batch updates for performance
  batchUpdate(updates: Array<{ type: 'addMessage' | 'addPart' | 'updatePart', data: any }>) {
    for (const update of updates) {
      switch (update.type) {
        case 'addMessage':
          this.addMessage(update.data)
          break
        case 'addPart':
          this.addPart(update.data)
          break
        case 'updatePart':
          this.updatePart(update.data.partId, update.data.updates)
          break
      }
    }
  }

  // Performance utilities
  getActiveStreamingCount(): number {
    return store.activeStreamingSessions.size
  }

  getCompletedCount(): number {
    return store.completedSessions.size
  }

  isSessionActive(sessionId: string): boolean {
    return store.activeStreamingSessions.has(sessionId)
  }

  // Cleanup old data
  cleanup(olderThanMs: number = 30 * 60 * 1000) { // 30 minutes
    const cutoff = Date.now() - olderThanMs
    const messageIdsToRemove: string[] = []
    
    for (const [messageId, message] of Object.entries(store.messages)) {
      if (message.timestamp < cutoff && message.completed) {
        messageIdsToRemove.push(messageId)
      }
    }
    
    // Remove old messages and their parts
    for (const messageId of messageIdsToRemove) {
      const partIds = store.partIdsByMessage[messageId] || []
      
      // Remove parts
      for (const partId of partIds) {
        setStore('parts', partId, undefined as any)
      }
      
      // Remove indexes
      setStore('partIdsByMessage', messageId, undefined as any)
      setStore('toolPartsByMessage', messageId, undefined as any)
      setStore('messages', messageId, undefined as any)
    }
  }
}

// Global store instance
export const performanceStore = new PerformanceStore()

// Reactive hooks
export function useMessage(messageId: string) {
  return () => performanceStore.getMessage(messageId)
}

export function usePart(partId: string) {
  return () => performanceStore.getPart(partId)
}

export function useSessionMessages(sessionId: string) {
  return () => performanceStore.getSessionMessages(sessionId)
}

export function useMessageParts(messageId: string) {
  return () => performanceStore.getMessageParts(messageId)
}

export function useLatestTool(sessionId: string) {
  return () => performanceStore.getLatestTool(sessionId)
}

export function useActiveTask(sessionId: string) {
  return () => performanceStore.getActiveTask(sessionId)
}

export function useLatestStreamingPart(sessionId: string) {
  return () => performanceStore.getLatestStreamingPart(sessionId)
}

export function useToolParts(messageId: string) {
  return () => performanceStore.getToolParts(messageId)
}
