// Consolidated performance store implementation
import { createSignal, createEffect, onCleanup } from "solid-js"

// Core interfaces (simplified from original)
export interface Message {
  id: string
  sessionId: string
  type: "user" | "assistant" | "system"
  content?: string
  timestamp: number
  completed: boolean
}

export interface Part {
  id: string
  messageId: string
  type: "text" | "tool" | "reasoning" | "file"
  content: string
  status: "pending" | "running" | "completed" | "error"
  metadata?: Record<string, any>
  streaming: boolean
  completed: boolean
}

export interface ToolInfo {
  partId: string
  tool: string
  status: string
  title?: string
  error?: string
}

export interface TaskInfo {
  taskId: string
  status: string
  progress: number
}

export interface PartInfo {
  partId: string
  type: string
  status: string
  progress: number
}

// Unified Performance Store
export class PerformanceStore {
  // Core data storage
  private messages = new Map<string, Message>()
  private parts = new Map<string, Part>()
  
  // Indexes for O(1) lookups
  private messageIdsBySession = new Map<string, string[]>()
  private partIdsByMessage = new Map<string, string[]>()
  
  // Performance indexes
  private latestToolBySession = new Map<string, ToolInfo>()
  private activeTaskBySession = new Map<string, TaskInfo>()
  private latestStreamingPartBySession = new Map<string, PartInfo>()
  private toolPartsByMessage = new Map<string, ToolInfo[]>()
  
  // Live tracking
  private activeStreamingSessions = new Set<string>()
  private completedSessions = new Set<string>()
  
  // Reactive signals
  private messageSignal = createSignal<Map<string, Message>>(new Map())
  private partSignal = createSignal<Map<string, Part>>(new Map())
  private sessionSignal = createSignal<Map<string, string[]>>(new Map())
  
  // Getters with O(1) access
  getMessage(messageId: string): Message | undefined {
    return this.messages.get(messageId)
  }
  
  getPart(partId: string): Part | undefined {
    return this.parts.get(partId)
  }
  
  getSessionMessages(sessionId: string): Message[] {
    const messageIds = this.messageIdsBySession.get(sessionId) || []
    return messageIds.map(id => this.messages.get(id)).filter(Boolean) as Message[]
  }
  
  getMessageParts(messageId: string): Part[] {
    const partIds = this.partIdsByMessage.get(messageId) || []
    return partIds.map(id => this.parts.get(id)).filter(Boolean) as Part[]
  }
  
  // O(1) tool lookups
  getLatestTool(sessionId: string): ToolInfo | undefined {
    return this.latestToolBySession.get(sessionId)
  }
  
  getActiveTask(sessionId: string): TaskInfo | undefined {
    return this.activeTaskBySession.get(sessionId)
  }
  
  getLatestStreamingPart(sessionId: string): PartInfo | undefined {
    return this.latestStreamingPartBySession.get(sessionId)
  }
  
  getToolParts(messageId: string): ToolInfo[] {
    return this.toolPartsByMessage.get(messageId) || []
  }
  
  // Session management
  getActiveStreamingSessions(): string[] {
    return Array.from(this.activeStreamingSessions)
  }
  
  getCompletedSessions(): string[] {
    return Array.from(this.completedSessions)
  }
  
  isSessionStreaming(sessionId: string): boolean {
    return this.activeStreamingSessions.has(sessionId)
  }
  
  isSessionCompleted(sessionId: string): boolean {
    return this.completedSessions.has(sessionId)
  }
  
  // Add/update operations
  addMessage(message: Message): void {
    this.messages.set(message.id, message)
    
    // Update session index
    if (!this.messageIdsBySession.has(message.sessionId)) {
      this.messageIdsBySession.set(message.sessionId, [])
    }
    const sessionMessages = this.messageIdsBySession.get(message.sessionId)!
    if (!sessionMessages.includes(message.id)) {
      sessionMessages.push(message.id)
    }
    
    // Update reactive signal
    this.messageSignal[1](new Map(this.messages))
  }
  
  updateMessage(messageId: string, updates: Partial<Message>): void {
    const message = this.messages.get(messageId)
    if (message) {
      const updatedMessage = { ...message, ...updates }
      this.messages.set(messageId, updatedMessage)
      this.messageSignal[1](new Map(this.messages))
    }
  }
  
  addPart(part: Part): void {
    this.parts.set(part.id, part)
    
    // Update message index
    if (!this.partIdsByMessage.has(part.messageId)) {
      this.partIdsByMessage.set(part.messageId, [])
    }
    const messageParts = this.partIdsByMessage.get(part.messageId)!
    if (!messageParts.includes(part.id)) {
      messageParts.push(part.id)
    }
    
    // Update reactive signal
    this.partSignal[1](new Map(this.parts))
  }
  
  updatePart(partId: string, updates: Partial<Part>): void {
    const part = this.parts.get(partId)
    if (part) {
      const updatedPart = { ...part, ...updates }
      this.parts.set(partId, updatedPart)
      this.partSignal[1](new Map(this.parts))
    }
  }
  
  // Tool management
  setLatestTool(sessionId: string, toolInfo: ToolInfo): void {
    this.latestToolBySession.set(sessionId, toolInfo)
  }
  
  addToolPart(messageId: string, toolInfo: ToolInfo): void {
    if (!this.toolPartsByMessage.has(messageId)) {
      this.toolPartsByMessage.set(messageId, [])
    }
    const toolParts = this.toolPartsByMessage.get(messageId)!
    toolParts.push(toolInfo)
  }
  
  // Task management
  setActiveTask(sessionId: string, taskInfo: TaskInfo): void {
    this.activeTaskBySession.set(sessionId, taskInfo)
  }
  
  clearActiveTask(sessionId: string): void {
    this.activeTaskBySession.delete(sessionId)
  }
  
  // Streaming management
  setStreamingSession(sessionId: string, streaming: boolean): void {
    if (streaming) {
      this.activeStreamingSessions.add(sessionId)
    } else {
      this.activeStreamingSessions.delete(sessionId)
    }
  }
  
  setLatestStreamingPart(sessionId: string, partInfo: PartInfo): void {
    this.latestStreamingPartBySession.set(sessionId, partInfo)
  }
  
  completeSession(sessionId: string): void {
    this.completedSessions.add(sessionId)
    this.activeStreamingSessions.delete(sessionId)
    this.activeTaskBySession.delete(sessionId)
    this.latestStreamingPartBySession.delete(sessionId)
  }
  
  // Cleanup operations
  cleanup(): void {
    this.messages.clear()
    this.parts.clear()
    this.messageIdsBySession.clear()
    this.partIdsByMessage.clear()
    this.latestToolBySession.clear()
    this.activeTaskBySession.clear()
    this.latestStreamingPartBySession.clear()
    this.toolPartsByMessage.clear()
    this.activeStreamingSessions.clear()
    this.completedSessions.clear()
  }
  
  // Statistics
  getStats(): {
    totalMessages: number
    totalParts: number
    activeSessions: number
    completedSessions: number
    streamingSessions: number
  } {
    return {
      totalMessages: this.messages.size,
      totalParts: this.parts.size,
      activeSessions: this.activeStreamingSessions.size,
      completedSessions: this.completedSessions.size,
      streamingSessions: this.activeStreamingSessions.size
    }
  }
  
  // Reactive hooks
  useMessages() {
    return this.messageSignal[0]()
  }
  
  useParts() {
    return this.partSignal[0]()
  }
  
  useSessions() {
    return this.sessionSignal[0]()
  }
}

// Global performance store instance
export const performanceStore = new PerformanceStore()

// Reactive hooks for store usage
export function usePerformanceStore() {
  const messages = performanceStore.useMessages()
  const parts = performanceStore.useParts()
  const sessions = performanceStore.useSessions()
  
  return {
    messages,
    parts,
    sessions,
    getMessage: (id: string) => performanceStore.getMessage(id),
    getPart: (id: string) => performanceStore.getPart(id),
    getSessionMessages: (sessionId: string) => performanceStore.getSessionMessages(sessionId),
    getMessageParts: (messageId: string) => performanceStore.getMessageParts(messageId),
    getLatestTool: (sessionId: string) => performanceStore.getLatestTool(sessionId),
    getActiveTask: (sessionId: string) => performanceStore.getActiveTask(sessionId),
    getLatestStreamingPart: (sessionId: string) => performanceStore.getLatestStreamingPart(sessionId),
    getToolParts: (messageId: string) => performanceStore.getToolParts(messageId),
    getActiveStreamingSessions: () => performanceStore.getActiveStreamingSessions(),
    getCompletedSessions: () => performanceStore.getCompletedSessions(),
    isSessionStreaming: (sessionId: string) => performanceStore.isSessionStreaming(sessionId),
    isSessionCompleted: (sessionId: string) => performanceStore.isSessionCompleted(sessionId),
    addMessage: (message: Message) => performanceStore.addMessage(message),
    updateMessage: (messageId: string, updates: Partial<Message>) => performanceStore.updateMessage(messageId, updates),
    addPart: (part: Part) => performanceStore.addPart(part),
    updatePart: (partId: string, updates: Partial<Part>) => performanceStore.updatePart(partId, updates),
    setLatestTool: (sessionId: string, toolInfo: ToolInfo) => performanceStore.setLatestTool(sessionId, toolInfo),
    addToolPart: (messageId: string, toolInfo: ToolInfo) => performanceStore.addToolPart(messageId, toolInfo),
    setActiveTask: (sessionId: string, taskInfo: TaskInfo) => performanceStore.setActiveTask(sessionId, taskInfo),
    clearActiveTask: (sessionId: string) => performanceStore.clearActiveTask(sessionId),
    setStreamingSession: (sessionId: string, streaming: boolean) => performanceStore.setStreamingSession(sessionId, streaming),
    setLatestStreamingPart: (sessionId: string, partInfo: PartInfo) => performanceStore.setLatestStreamingPart(sessionId, partInfo),
    completeSession: (sessionId: string) => performanceStore.completeSession(sessionId),
    getStats: () => performanceStore.getStats(),
    cleanup: () => performanceStore.cleanup()
  }
}
