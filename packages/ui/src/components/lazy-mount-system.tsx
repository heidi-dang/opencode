import { createSignal, createEffect, onCleanup, For, Show, type JSX } from "solid-js"

interface LazyComponentProps {
  children: JSX.Element
  threshold?: number        // Intersection threshold (0-1)
  rootMargin?: string     // Margin around root element
  placeholder?: JSX.Element
  fallback?: JSX.Element
  defer?: boolean         // Defer mounting even if visible
  deferDelay?: number     // Delay before deferred mounting (ms)
}

class LazyMountManager {
  private observers = new Map<string, IntersectionObserver>()
  private deferredTimers = new Map<string, number>()
  private mountedComponents = new Set<string>()
  
  // Create intersection observer for a component
  createObserver(id: string, options: IntersectionObserverInit, callback: () => void): IntersectionObserver {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            callback()
            // Stop observing once mounted
            this.stopObserving(id)
          }
        })
      },
      options
    )
    
    this.observers.set(id, observer)
    return observer
  }
  
  // Start observing an element
  observe(id: string, element: Element, options: IntersectionObserverInit, callback: () => void): void {
    if (this.mountedComponents.has(id)) {
      callback() // Already mounted
      return
    }
    
    const observer = this.createObserver(id, options, callback)
    observer.observe(element)
  }
  
  // Stop observing an element
  stopObserving(id: string): void {
    const observer = this.observers.get(id)
    if (observer) {
      observer.disconnect()
      this.observers.delete(id)
    }
  }
  
  // Mark component as mounted
  markMounted(id: string): void {
    this.mountedComponents.add(id)
  }
  
  // Check if component is mounted
  isMounted(id: string): boolean {
    return this.mountedComponents.has(id)
  }
  
  // Set deferred mounting timer
  setDeferredTimer(id: string, callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      callback()
      this.deferredTimers.delete(id)
    }, delay) as unknown as number
    
    this.deferredTimers.set(id, timer)
  }
  
  // Clear deferred timer
  clearDeferredTimer(id: string): void {
    const timer = this.deferredTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.deferredTimers.delete(id)
    }
  }
  
  // Cleanup all resources for a component
  cleanup(id: string): void {
    this.stopObserving(id)
    this.clearDeferredTimer(id)
    this.mountedComponents.delete(id)
  }
  
  // Get statistics
  getStats() {
    return {
      observing: this.observers.size,
      deferred: this.deferredTimers.size,
      mounted: this.mountedComponents.size
    }
  }
}

// Global lazy mount manager
export const lazyMountManager = new LazyMountManager()

// Lazy mount component
export function LazyMount(props: LazyComponentProps): JSX.Element {
  const [isMounted, setIsMounted] = createSignal(false)
  const [isVisible, setIsVisible] = createSignal(false)
  const [shouldMount, setShouldMount] = createSignal(false)
  
  let elementRef: HTMLDivElement | undefined
  const componentId = `lazy-${Math.random().toString(36).slice(2)}`
  
  // Default placeholder
  const defaultPlaceholder = (
    <div class="lazy-placeholder" style={{
      'min-height': '100px',
      'background-color': 'var(--color-bg-secondary)',
      border: '1px dashed var(--color-border-primary)',
      'border-radius': '4px',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      color: 'var(--color-text-secondary)',
      'font-size': '14px'
    }}>
      Loading...
    </div>
  )
  
  // Setup intersection observer
  createEffect(() => {
    if (!elementRef) return
    
    const options: IntersectionObserverInit = {
      threshold: props.threshold ?? 0.1,
      rootMargin: props.rootMargin ?? '50px'
    }
    
    const handleIntersection = () => {
      setIsVisible(true)
      
      if (props.defer) {
        // Deferred mounting
        const delay = props.deferDelay ?? 200
        lazyMountManager.setDeferredTimer(componentId, () => {
          setShouldMount(true)
          setIsMounted(true)
          lazyMountManager.markMounted(componentId)
        }, delay)
      } else {
        // Immediate mounting
        setShouldMount(true)
        setIsMounted(true)
        lazyMountManager.markMounted(componentId)
      }
    }
    
    lazyMountManager.observe(componentId, elementRef, options, handleIntersection)
    
    onCleanup(() => {
      lazyMountManager.cleanup(componentId)
    })
  })
  
  return (
    <div 
      ref={elementRef}
      class="lazy-mount-container"
      style={{ 'contain': 'layout' }}
    >
      <Show 
        when={shouldMount()} 
        fallback={props.placeholder ?? defaultPlaceholder}
      >
        {props.children}
      </Show>
    </div>
  )
}

// Lazy mount for expensive computations
interface LazyComputationProps<T> {
  compute: () => T
  children: (result: T) => JSX.Element
  threshold?: number
  rootMargin?: string
  placeholder?: JSX.Element
}

export function LazyComputation<T>(props: LazyComputationProps<T>): JSX.Element {
  const [result, setResult] = createSignal<T | undefined>()
  const [isComputing, setIsComputing] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>()
  
  let elementRef: HTMLDivElement | undefined
  const componentId = `lazy-comp-${Math.random().toString(36).slice(2)}`
  
  // Default placeholder
  const defaultPlaceholder = (
    <div class="lazy-computation-placeholder" style={{
      'min-height': '60px',
      'background-color': 'var(--color-bg-secondary)',
      border: '1px dashed var(--color-border-primary)',
      'border-radius': '4px',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      color: 'var(--color-text-secondary)',
      'font-size': '14px'
    }}>
      Computing...
    </div>
  )
  
  // Setup intersection observer
  createEffect(() => {
    if (!elementRef) return
    
    const options: IntersectionObserverInit = {
      threshold: props.threshold ?? 0.1,
      rootMargin: props.rootMargin ?? '50px'
    }
    
    const handleIntersection = async () => {
      setIsComputing(true)
      setError(undefined)
      
      try {
        // Defer computation to next frame
        await new Promise(resolve => setTimeout(resolve, 0))
        
        const computationResult = props.compute()
        setResult(computationResult)
        lazyMountManager.markMounted(componentId)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsComputing(false)
      }
    }
    
    lazyMountManager.observe(componentId, elementRef, options, handleIntersection)
    
    onCleanup(() => {
      lazyMountManager.cleanup(componentId)
    })
  })
  
  const resultValue = result()
  const errorValue = error()
  const isComputingValue = isComputing()
  
  return (
    <div 
      ref={elementRef}
      class="lazy-computation-container"
      style={{ 'contain': 'layout' }}
    >
      <Show when={resultValue !== undefined}>
        {props.children(resultValue!)}
      </Show>
      
      <Show when={errorValue}>
        <div class="computation-error" style={{
          padding: '8px',
          'background-color': 'var(--color-error-bg)',
          border: '1px solid var(--color-error-border)',
          'border-radius': '4px',
          color: 'var(--color-error-text)',
          'font-size': '12px'
        }}>
          Error: {errorValue.message}
        </div>
      </Show>
      
      <Show when={isComputingValue}>
        {props.placeholder ?? defaultPlaceholder}
      </Show>
      
      <Show when={resultValue === undefined && !isComputingValue && !errorValue}>
        {props.placeholder ?? defaultPlaceholder}
      </Show>
    </div>
  )
}

// Lazy mount for lists with virtualization
interface LazyListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => JSX.Element
  itemHeight?: number
  containerHeight?: number
  overscan?: number
  threshold?: number
  placeholder?: JSX.Element
}

export function LazyList<T>(props: LazyListProps<T>): JSX.Element {
  const [visibleRange, setVisibleRange] = createSignal({ start: 0, end: 10 })
  const [containerHeight, setContainerHeight] = createSignal(400)
  
  const itemHeight = props.itemHeight ?? 60
  const overscan = props.overscan ?? 5
  
  let containerRef: HTMLDivElement | undefined
  
  // Calculate visible range based on scroll
  const calculateVisibleRange = (scrollTop: number) => {
    const start = Math.floor(scrollTop / itemHeight)
    const visibleCount = Math.ceil(containerHeight() / itemHeight)
    const end = start + visibleCount
    
    setVisibleRange({
      start: Math.max(0, start - overscan),
      end: Math.min(props.items.length, end + overscan)
    })
  }
  
  // Handle scroll events
  const handleScroll = () => {
    if (!containerRef) return
    calculateVisibleRange(containerRef.scrollTop)
  }
  
  // Setup container
  createEffect(() => {
    if (!containerRef) return
    
    const height = containerRef.clientHeight
    setContainerHeight(height)
    
    // Initial visible range
    calculateVisibleRange(0)
  })
  
  const range = visibleRange()
  const visibleItems = props.items.slice(range.start, range.end)
  const totalHeight = props.items.length * itemHeight
  
  return (
    <div 
      ref={containerRef}
      class="lazy-list-container"
      style={{
        height: props.containerHeight ?? '400px',
        overflow: 'auto',
        position: 'relative'
      }}
      onScroll={handleScroll}
    >
      {/* Spacer for total height */}
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {/* Visible items */}
        <For each={visibleItems}>
          {(item, index) => {
            const actualIndex = range.start + index()
            return (
              <div
                style={{
                  position: 'absolute',
                  top: `${actualIndex * itemHeight}px`,
                  height: `${itemHeight}px`,
                  width: '100%',
                  'contain': 'layout paint'
                }}
              >
                <LazyMount threshold={0.5} rootMargin="50px">
                  {props.renderItem(item, actualIndex)}
                </LazyMount>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}

// Debounced lazy mount for rapidly changing content
interface DebouncedLazyProps extends LazyComponentProps {
  debounceMs?: number
  stableTime?: number
}

export function DebouncedLazy(props: DebouncedLazyProps): JSX.Element {
  const [shouldShow, setShouldShow] = createSignal(false)
  let debounceTimer: number | undefined
  let stableTimer: number | undefined
  let lastVisibleTime = 0
  
  let elementRef: HTMLDivElement | undefined
  const componentId = `debounced-${Math.random().toString(36).slice(2)}`
  
  const handleVisibilityChange = (visible: boolean) => {
    const now = Date.now()
    
    if (visible) {
      lastVisibleTime = now
      
      // Clear existing timers
      if (debounceTimer) clearTimeout(debounceTimer)
      if (stableTimer) clearTimeout(stableTimer)
      
      // Debounce timer
      debounceTimer = setTimeout(() => {
        // Stable time check
        const timeSinceVisible = now - lastVisibleTime
        const stableTimeRequired = props.stableTime ?? 300
        
        if (timeSinceVisible >= stableTimeRequired) {
          setShouldShow(true)
        } else {
          // Wait for stable time
          stableTimer = setTimeout(() => {
            setShouldShow(true)
          }, stableTimeRequired - timeSinceVisible) as unknown as number
        }
      }, props.debounceMs ?? 100) as unknown as number
    } else {
      // Hide immediately when not visible
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }
      if (stableTimer) {
        clearTimeout(stableTimer)
        stableTimer = undefined
      }
      setShouldShow(false)
    }
  }
  
  // Setup intersection observer
  createEffect(() => {
    if (!elementRef) return
    
    const options: IntersectionObserverInit = {
      threshold: props.threshold ?? 0.1,
      rootMargin: props.rootMargin ?? '50px'
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false
        handleVisibilityChange(visible)
      },
      options
    )
    
    observer.observe(elementRef)
    
    onCleanup(() => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
      if (stableTimer) clearTimeout(stableTimer)
    })
  })
  
  return (
    <div 
      ref={elementRef}
      class="debounced-lazy-container"
      style={{ 'contain': 'layout' }}
    >
      <Show 
        when={shouldShow()} 
        fallback={props.placeholder}
      >
        {props.children}
      </Show>
    </div>
  )
}

// Reactive hook for lazy mount statistics
export function useLazyMountStats() {
  const [stats, setStats] = createSignal(lazyMountManager.getStats())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStats(lazyMountManager.getStats())
    }, 2000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return stats
}

// Export types
export type { LazyComponentProps, LazyComputationProps, LazyListProps, DebouncedLazyProps }
