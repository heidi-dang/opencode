import { createSignal, createEffect, onCleanup } from "solid-js"
import { Message, Part, ToolInfo, TaskInfo, PartInfo } from "./performance-store"

// Simple performance store implementation without SolidJS store issues
class SimplePerformanceStore {
  private messages = new Map<string, Message>()
  private parts = new Map<string, Part>()
  private messageIdsBySession = new Map<string, string[]>()
  private partIdsByMessage = new Map<string, string[]>()
  private latestToolBySession = new Map<string, ToolInfo>()
  private activeTaskBySession = new Map<string, TaskInfo>()
  private latestStreamingPartBySession = new Map<string, PartInfo>()
  private toolPartsByMessage = new Map<string, ToolInfo[]>()
  private activeStreamingSessions = new Set<string>()
  private completedSessions = new Set<string>()

  // Getters with O(1) access
  getMessage(messageId: string): Message | undefined {
    return this.messages.get(messageId)
  }

  getPart(partId: string): Part | undefined {
    return this.parts.get(partId)
  }

  getSessionMessages(sessionId: string): Message[] {
    const messageIds = this.messageIdsBySession.get(sessionId) || []
    return messageIds.map((id) => this.messages.get(id)).filter(Boolean) as Message[]
  }

  getMessageParts(messageId: string): Part[] {
    const partIds = this.partIdsByMessage.get(messageId) || []
    return partIds.map((id) => this.parts.get(id)).filter(Boolean) as Part[]
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

  // Mutations with index updates
  addMessage(message: Message) {
    this.messages.set(message.id, message)

    // Update session index
    const sessionMessages = this.messageIdsBySession.get(message.sessionId) || []
    if (!sessionMessages.includes(message.id)) {
      this.messageIdsBySession.set(message.sessionId, [...sessionMessages, message.id])
    }

    // Initialize parts index
    if (!this.partIdsByMessage.has(message.id)) {
      this.partIdsByMessage.set(message.id, [])
    }
  }

  addPart(part: Part) {
    this.parts.set(part.id, part)

    // Update message index
    const messageParts = this.partIdsByMessage.get(part.messageId) || []
    if (!messageParts.includes(part.id)) {
      this.partIdsByMessage.set(part.messageId, [...messageParts, part.id])
    }

    // Update tool index if it's a tool part
    if (part.type === "tool") {
      const toolInfo: ToolInfo = {
        partId: part.id,
        tool: part.metadata?.tool || "unknown",
        status: part.status,
        title: part.metadata?.title,
        error: part.metadata?.error,
        timestamp: Date.now(),
      }

      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId) {
        this.latestToolBySession.set(sessionId, toolInfo)

        const messageTools = this.toolPartsByMessage.get(part.messageId) || []
        this.toolPartsByMessage.set(part.messageId, [...messageTools, toolInfo])
      }
    }

    // Update streaming tracking
    if (part.streaming) {
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId) {
        this.latestStreamingPartBySession.set(sessionId, {
          partId: part.id,
          messageId: part.messageId,
          type: part.type,
          status: part.status,
          streaming: true,
        })
        this.activeStreamingSessions.add(sessionId)
      }
    }
  }

  updatePart(partId: string, updates: Partial<Part>) {
    const part = this.parts.get(partId)
    if (!part) return

    const updatedPart = { ...part, ...updates }
    this.parts.set(partId, updatedPart)

    // Update tool index if it's a tool part
    if (part.type === "tool") {
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId && this.latestToolBySession.get(sessionId)?.partId === partId) {
        const updatedTool = {
          ...this.latestToolBySession.get(sessionId)!,
          status: updates.status || part.status,
          title: updates.metadata?.title || part.metadata?.title,
          error: updates.metadata?.error || part.metadata?.error,
          timestamp: Date.now(),
        }
        this.latestToolBySession.set(sessionId, updatedTool)
      }
    }

    // Update streaming tracking
    if (updates.streaming === false && part.streaming) {
      const sessionId = this.getMessage(part.messageId)?.sessionId
      if (sessionId && this.latestStreamingPartBySession.get(sessionId)?.partId === partId) {
        const updatedStreaming = {
          ...this.latestStreamingPartBySession.get(sessionId)!,
          streaming: false,
          status: updates.status || part.status,
        }
        this.latestStreamingPartBySession.set(sessionId, updatedStreaming)
      }
    }

    // Mark completed
    if (updates.completed === true && !part.completed) {
      const completedPart = { ...updatedPart, completed: true }
      this.parts.set(partId, completedPart)

      // Check if all parts in message are completed
      const messageParts = this.getMessageParts(part.messageId)
      const allCompleted = messageParts.every((p) => p.completed)

      if (allCompleted) {
        const message = this.getMessage(part.messageId)
        if (message) {
          const completedMessage = { ...message, completed: true }
          this.messages.set(part.messageId, completedMessage)

          const sessionId = message.sessionId
          if (sessionId) {
            this.completedSessions.add(sessionId)
            this.activeStreamingSessions.delete(sessionId)
          }
        }
      }
    }
  }

  // Performance utilities
  getActiveStreamingCount(): number {
    return this.activeStreamingSessions.size
  }

  getCompletedCount(): number {
    return this.completedSessions.size
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeStreamingSessions.has(sessionId)
  }

  // Cleanup old data
  cleanup(olderThanMs: number = 30 * 60 * 1000) {
    // 30 minutes
    const cutoff = Date.now() - olderThanMs
    const messageIdsToRemove: string[] = []

    for (const [messageId, message] of this.messages.entries()) {
      if (message.timestamp < cutoff && message.completed) {
        messageIdsToRemove.push(messageId)
      }
    }

    // Remove old messages and their parts
    for (const messageId of messageIdsToRemove) {
      const partIds = this.partIdsByMessage.get(messageId) || []

      // Remove parts
      for (const partId of partIds) {
        this.parts.delete(partId)
      }

      // Remove indexes
      this.partIdsByMessage.delete(messageId)
      this.toolPartsByMessage.delete(messageId)
      this.messages.delete(messageId)
    }
  }
}

// Global store instance
export const performanceStore = new SimplePerformanceStore()

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
