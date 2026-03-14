import { createSignal, createEffect, onCleanup, batch, Show } from "solid-js"
import { performanceStore } from "./simple-performance-store"

interface ScrollState {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  isAtBottom: boolean
  isUserScrolling: boolean
  lastScrollTime: number
}

interface ScrollOptions {
  bottomThreshold: number // Distance from bottom to consider "at bottom"
  lockDelay: number // Delay before releasing scroll lock (ms)
  smooth: boolean // Use smooth scrolling (shorthand)
  autoScroll: boolean // Enable auto-scroll to bottom
}

class ScrollDisciplineManager {
  private element: HTMLElement | undefined
  private state: ScrollState
  private options: ScrollOptions
  private scrollLockTimer: number | null = null
  private userScrollTimer: number | null = null
  private observers: Set<() => void> = new Set()

  constructor(options: Partial<ScrollOptions> = {}) {
    this.options = {
      bottomThreshold: 100,
      lockDelay: 1000,
      smooth: true,
      autoScroll: true,
      ...options,
    }

    this.state = {
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      isAtBottom: true,
      isUserScrolling: false,
      lastScrollTime: Date.now(),
    }
  }

  // Initialize scroll discipline for an element
  initialize(element: HTMLElement): void {
    this.element = element
    this.updateState()

    // Add scroll listener
    element.addEventListener("scroll", this.handleScroll.bind(this), { passive: true })

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.updateState()
      this.notifyObservers()
    })
    resizeObserver.observe(element)

    // Store observer for cleanup
    this.resizeObserver = resizeObserver
  }

  private resizeObserver: ResizeObserver | undefined

  // Handle scroll events
  private handleScroll(): void {
    if (!this.element) return

    const previousState = { ...this.state }
    this.updateState()

    // Detect user scrolling
    const now = Date.now()
    const timeSinceLastScroll = now - this.state.lastScrollTime

    if (timeSinceLastScroll < 100) {
      this.state.isUserScrolling = true

      // Clear existing timer
      if (this.userScrollTimer) {
        clearTimeout(this.userScrollTimer)
      }

      // Set timer to detect when user stops scrolling
      this.userScrollTimer = setTimeout(() => {
        this.state.isUserScrolling = false
        this.notifyObservers()
      }, 150) as unknown as number
    }

    // Auto-scroll to bottom if conditions are met
    if (this.shouldAutoScroll(previousState)) {
      this.scrollToBottom()
    }

    this.notifyObservers()
  }

  // Update scroll state
  private updateState(): void {
    if (!this.element) return

    this.state.scrollTop = this.element.scrollTop
    this.state.scrollHeight = this.element.scrollHeight
    this.state.clientHeight = this.element.clientHeight
    this.state.isAtBottom = this.checkAtBottom()
    this.state.lastScrollTime = Date.now()
  }

  // Check if at bottom (internal calculation)
  private checkAtBottom(): boolean {
    const { scrollTop, scrollHeight, clientHeight } = this.state
    return scrollHeight - scrollTop - clientHeight <= this.options.bottomThreshold
  }

  // Determine if should auto-scroll
  private shouldAutoScroll(previousState: ScrollState): boolean {
    if (!this.options.autoScroll) return false

    // Auto-scroll if was at bottom and content grew
    if (
      previousState.isAtBottom &&
      this.state.scrollHeight > previousState.scrollHeight &&
      !this.state.isUserScrolling
    ) {
      return true
    }

    // Auto-scroll if scroll lock is active
    if (this.scrollLockTimer !== null) {
      return true
    }

    return false
  }

  // Scroll to bottom
  scrollToBottom(options: { smooth?: boolean; force?: boolean } = {}): void {
    if (!this.element) return

    const { scrollTop, scrollHeight, clientHeight } = this.state
    const targetScrollTop = Math.max(0, scrollHeight - clientHeight)

    // Don't scroll if already at bottom (unless forced)
    if (!options.force && Math.abs(scrollTop - targetScrollTop) < 5) {
      return
    }

    const useSmooth = options.smooth ?? this.options.smooth

    if (useSmooth) {
      this.element.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      })
    } else {
      this.element.scrollTop = targetScrollTop
    }
  }

  // Lock scroll to bottom for a period
  lockToBottom(duration?: number): void {
    const lockDuration = duration ?? this.options.lockDelay

    // Clear existing timer
    if (this.scrollLockTimer) {
      clearTimeout(this.scrollLockTimer)
    }

    // Set new timer
    this.scrollLockTimer = setTimeout(() => {
      this.scrollLockTimer = null
      this.notifyObservers()
    }, lockDuration) as unknown as number

    // Scroll to bottom immediately
    this.scrollToBottom({ force: true })
    this.notifyObservers()
  }

  // Release scroll lock
  releaseScrollLock(): void {
    if (this.scrollLockTimer) {
      clearTimeout(this.scrollLockTimer)
      this.scrollLockTimer = null
      this.notifyObservers()
    }
  }

  // Enable/disable auto-scroll
  setAutoScroll(enabled: boolean): void {
    this.options.autoScroll = enabled
    this.notifyObservers()
  }

  // Get current scroll state
  getState(): ScrollState {
    return { ...this.state }
  }

  // Check if user is scrolling
  isUserScrolling(): boolean {
    return this.state.isUserScrolling
  }

  // Check if at bottom
  isAtBottom(): boolean {
    return this.state.isAtBottom
  }

  // Check if scroll is locked
  isLocked(): boolean {
    return this.scrollLockTimer !== null
  }

  // Subscribe to scroll state changes
  subscribe(callback: () => void): () => void {
    this.observers.add(callback)

    // Return unsubscribe function
    return () => {
      this.observers.delete(callback)
    }
  }

  // Notify all observers
  private notifyObservers(): void {
    for (const callback of this.observers) {
      callback()
    }
  }

  // Cleanup
  cleanup(): void {
    if (this.element) {
      this.element.removeEventListener("scroll", this.handleScroll.bind(this))
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }

    if (this.scrollLockTimer) {
      clearTimeout(this.scrollLockTimer)
    }

    if (this.userScrollTimer) {
      clearTimeout(this.userScrollTimer)
    }

    this.observers.clear()
  }
}

// Reactive scroll discipline hook
export function useScrollDiscipline(element: () => HTMLElement | undefined, options: Partial<ScrollOptions> = {}) {
  const [scrollState, setScrollState] = createSignal<ScrollState>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    isAtBottom: true,
    isUserScrolling: false,
    lastScrollTime: Date.now(),
  })

  const [manager] = createSignal(new ScrollDisciplineManager(options))

  createEffect(() => {
    const el = element()
    const mgr = manager()

    if (el) {
      mgr.initialize(el)

      // Subscribe to state changes
      const unsubscribe = mgr.subscribe(() => {
        setScrollState(mgr.getState())
      })

      // Initial state
      setScrollState(mgr.getState())

      onCleanup(() => {
        unsubscribe()
        mgr.cleanup()
      })
    }
  })

  // Action methods
  const scrollToBottom = (options?: { smooth?: boolean; force?: boolean }) => {
    manager().scrollToBottom(options)
  }

  const lockToBottom = (duration?: number) => {
    manager().lockToBottom(duration)
  }

  const releaseScrollLock = () => {
    manager().releaseScrollLock()
  }

  const setAutoScroll = (enabled: boolean) => {
    manager().setAutoScroll(enabled)
  }

  return {
    scrollState,
    scrollToBottom,
    lockToBottom,
    releaseScrollLock,
    setAutoScroll,
    isUserScrolling: () => manager().isUserScrolling(),
    isAtBottom: () => manager().isAtBottom(),
    isLocked: () => manager().isLocked(),
  }
}

// Scroll-to-bottom button component
interface ScrollToBottomButtonProps {
  onScroll: () => void
  visible: boolean
}

export function ScrollToBottomButton(props: ScrollToBottomButtonProps): any {
  return (
    <Show when={props.visible}>
      <div
        class="scroll-to-bottom-button"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          "background-color": "var(--color-bg-primary)",
          border: "1px solid var(--color-border-primary)",
          padding: "8px 16px",
          "border-radius": "20px",
          cursor: "pointer",
          "z-index": 1000,
          "box-shadow": "0 2px 8px rgba(0,0,0,0.1)",
          transition: "all 0.2s ease",
          "font-size": "14px",
          "font-weight": "500",
        }}
        onClick={props.onScroll}
      >
        ↓ Scroll to latest
      </div>
    </Show>
  )
}

// Enhanced container with scroll discipline
interface ScrollDisciplinedContainerProps {
  children: any
  sessionId: string
  options?: Partial<ScrollOptions>
  showScrollButton?: boolean
}

export function ScrollDisciplinedContainer(props: ScrollDisciplinedContainerProps): any {
  let containerRef: HTMLElement | undefined

  const scroll = useScrollDiscipline(() => containerRef, props.options)

  // Auto-lock to bottom when new content arrives
  createEffect(() => {
    // This would be triggered by new messages/parts
    const messages = performanceStore.getSessionMessages(props.sessionId)
    const latestMessage = messages[messages.length - 1]

    if (latestMessage && latestMessage.completed) {
      // Lock to bottom for a short period after new completed message
      scroll.lockToBottom(2000)
    }
  })

  return (
    <div class="scroll-disciplined-container" style={{ position: "relative", height: "100%" }}>
      <div
        ref={containerRef as any}
        class="scroll-container"
        style={{
          height: "100%",
          overflow: "auto",
          "scroll-behavior": "smooth",
        }}
      >
        {props.children}
      </div>

      {props.showScrollButton && (
        <ScrollToBottomButton
          visible={!scroll.isAtBottom() && !scroll.isUserScrolling()}
          onScroll={() => scroll.scrollToBottom({ force: true })}
        />
      )}
    </div>
  )
}

// Global scroll discipline manager for chat
export const chatScrollManager = new ScrollDisciplineManager({
  bottomThreshold: 50,
  lockDelay: 1500,
  smooth: true,
  autoScroll: true,
})

// Export types
export type { ScrollState, ScrollOptions }
