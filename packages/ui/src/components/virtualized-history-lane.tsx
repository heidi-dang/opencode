import { Component, createSignal, createEffect, onCleanup, For, Show, type JSX } from "solid-js"
import { performanceStore } from "./simple-performance-store"
import { useSessionMessages } from "./simple-performance-store"

interface VirtualizedHistoryLaneProps {
  sessionId: string
}

interface VirtualItem {
  index: number
  messageId: string
  top: number
  height: number
  visible: boolean
}

interface VirtualListState {
  scrollTop: number
  containerHeight: number
  itemHeight: number
  overscan: number
  totalItems: number
  visibleRange: { start: number; end: number }
  items: VirtualItem[]
}

class MessageVirtualizer {
  private state: VirtualListState
  private containerRef: HTMLElement | undefined
  private isBottomAnchored = true

  constructor() {
    this.state = {
      scrollTop: 0,
      containerHeight: 600,
      itemHeight: 80,
      overscan: 5,
      totalItems: 0,
      visibleRange: { start: 0, end: 0 },
      items: [],
    }
  }

  // Calculate visible range based on scroll position
  calculateVisibleRange(scrollTop: number, containerHeight: number): { start: number; end: number } {
    const startIndex = Math.floor(scrollTop / this.state.itemHeight)
    const endIndex = Math.ceil((scrollTop + containerHeight) / this.state.itemHeight)

    // Add overscan for smooth scrolling
    const overscanStart = Math.max(0, startIndex - this.state.overscan)
    const overscanEnd = Math.min(this.state.totalItems, endIndex + this.state.overscan)

    return { start: overscanStart, end: overscanEnd }
  }

  // Generate virtual items for visible range
  generateVirtualItems(messages: any[]): VirtualItem[] {
    const { start, end } = this.state.visibleRange
    const items: VirtualItem[] = []

    for (let i = start; i < end; i++) {
      const message = messages[i]
      if (!message) continue

      items.push({
        index: i,
        messageId: message.id,
        top: i * this.state.itemHeight,
        height: this.state.itemHeight,
        visible: true,
      })
    }

    return items
  }

  // Bottom-anchor mode for live streaming
  scrollToBottom(): void {
    if (!this.containerRef) return

    const scrollHeight = this.state.totalItems * this.state.itemHeight
    const targetScrollTop = Math.max(0, scrollHeight - this.state.containerHeight)

    this.containerRef.scrollTop = targetScrollTop
    this.state.scrollTop = targetScrollTop
    this.isBottomAnchored = true
  }

  // Check if user is at bottom
  isAtBottom(): boolean {
    if (!this.containerRef) return true

    const scrollHeight = this.state.totalItems * this.state.itemHeight
    const currentScrollTop = this.containerRef.scrollTop
    const threshold = 100 // 100px from bottom

    return currentScrollTop >= scrollHeight - this.state.containerHeight - threshold
  }

  // Handle scroll events
  handleScroll(): void {
    if (!this.containerRef) return

    this.state.scrollTop = this.containerRef.scrollTop
    this.isBottomAnchored = this.isAtBottom()

    // Update visible range
    this.state.visibleRange = this.calculateVisibleRange(this.state.scrollTop, this.state.containerHeight)
  }

  // Update container
  setContainer(element: HTMLElement): void {
    this.containerRef = element
    this.state.containerHeight = element.clientHeight

    // Add scroll listener
    element.addEventListener("scroll", this.handleScroll.bind(this))
  }

  // Update total items and preserve scroll position
  updateTotalItems(newTotal: number): void {
    const wasAtBottom = this.isAtBottom()
    this.state.totalItems = newTotal

    if (wasAtBottom || this.isBottomAnchored) {
      this.scrollToBottom()
    } else {
      // Preserve scroll position
      this.state.visibleRange = this.calculateVisibleRange(this.state.scrollTop, this.state.containerHeight)
    }
  }

  // Get current state
  getState(): VirtualListState {
    return { ...this.state }
  }

  // Get total height
  getTotalHeight(): number {
    return this.state.totalItems * this.state.itemHeight
  }

  // Cleanup
  cleanup(): void {
    if (this.containerRef) {
      this.containerRef.removeEventListener("scroll", this.handleScroll.bind(this))
    }
  }
}

// Virtualized message item component
function VirtualMessageItem(props: { item: VirtualItem; message: any }): JSX.Element {
  return (
    <div
      data-message-id={props.message.id}
      class="virtual-message-item"
      style={{
        position: "absolute",
        top: `${props.item.top}px`,
        height: `${props.item.height}px`,
        width: "100%",
        "content-visibility": "auto",
        "contain-intrinsic-size": `0 ${props.item.height}px`,
        contain: "layout paint style",
      }}
    >
      <div class="message-header">
        <span class="message-type">{props.message.type}</span>
        <span class="message-time">{new Date(props.message.timestamp || 0).toLocaleTimeString()}</span>
      </div>

      <div class="message-content">
        <div class="message-preview">
          {props.message.content?.slice(0, 100)}
          {props.message.content && props.message.content.length > 100 ? "..." : ""}
        </div>
      </div>
    </div>
  )
}

// Main virtualized history lane component
export function VirtualizedHistoryLane(props: VirtualizedHistoryLaneProps): JSX.Element {
  const virtualizer = new MessageVirtualizer()
  const [containerRef, setContainerRef] = createSignal<HTMLElement | undefined>()
  const [virtualItems, setVirtualItems] = createSignal<VirtualItem[]>([])

  const messages = useSessionMessages(props.sessionId)

  // Initialize virtualizer
  createEffect(() => {
    const container = containerRef()
    const messageList = messages()

    if (container) {
      virtualizer.setContainer(container)
      virtualizer.updateTotalItems(messageList.length)

      // Generate virtual items
      const items = virtualizer.generateVirtualItems(messageList)
      setVirtualItems(items)
    }
  })

  // Update virtual items when messages change
  createEffect(() => {
    const messageList = messages()

    virtualizer.updateTotalItems(messageList.length)
    const items = virtualizer.generateVirtualItems(messageList)
    setVirtualItems(items)
  })

  // Auto-scroll to bottom when new messages arrive
  createEffect(() => {
    const messageList = messages()
    const prevLength = messageList.length

    // Use a timeout to ensure DOM updates first
    setTimeout(() => {
      if (virtualizer.isAtBottom()) {
        virtualizer.scrollToBottom()
      }
    }, 0)
  })

  // Cleanup
  onCleanup(() => {
    virtualizer.cleanup()
  })

  const vz = virtualizer

  return (
    <div
      data-component="virtualized-history-lane"
      class="virtualized-history-lane"
      style={{
        height: "600px",
        overflow: "auto",
        position: "relative",
      }}
      ref={setContainerRef}
    >
      {/* Spacer for total height */}
      <div
        style={{
          height: `${vz.getTotalHeight()}px`,
          position: "relative",
        }}
      >
        {/* Virtual items */}
        <For each={virtualItems()}>
          {(item) => {
            const message = messages()[item.index]
            return message ? <VirtualMessageItem item={item} message={message} /> : null
          }}
        </For>
      </div>

      {/* Bottom anchor indicator */}
      <Show when={!vz.isAtBottom()}>
        <div
          class="scroll-to-bottom-indicator"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            background: "var(--color-bg-primary)",
            border: "1px solid var(--color-border-primary)",
            padding: "8px 16px",
            "border-radius": "20px",
            cursor: "pointer",
            "z-index": 1000,
          }}
          onClick={() => vz.scrollToBottom()}
        >
          ↓ Scroll to latest
        </div>
      </Show>
    </div>
  )
}

// Performance monitoring for virtualization
export function useVirtualizationMetrics(sessionId: string) {
  const [metrics, setMetrics] = createSignal({
    visibleItems: 0,
    totalItems: 0,
    scrollHeight: 0,
    renderTime: 0,
  })

  createEffect(() => {
    const start = performance.now()
    const messageList = performanceStore.getSessionMessages(sessionId)
    const end = performance.now()

    setMetrics({
      visibleItems: Math.min(10, messageList.length), // Approximate visible items
      totalItems: messageList.length,
      scrollHeight: messageList.length * 80, // Approximate
      renderTime: end - start,
    })
  })

  return metrics
}
