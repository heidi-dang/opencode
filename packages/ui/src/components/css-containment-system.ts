import { createSignal, createEffect, onCleanup } from "solid-js"

interface ContainmentOptions {
  // CSS containment types
  layout?: boolean
  paint?: boolean
  size?: boolean
  style?: boolean
  
  // Layout optimization
  containIntrinsicSize?: string  // e.g., "0 200px"
  contentVisibility?: 'auto' | 'hidden' | 'visible'
  
  // Performance optimization
  willChange?: string          // Properties that will change
  transform?: string           // GPU acceleration hint
  
  // Viewport-based optimization
  viewportOptimization?: boolean
  intersectionThreshold?: number
}

interface ContainmentConfig {
  // Default settings for different content types
  message: ContainmentOptions
  tool: ContainmentOptions
  code: ContainmentOptions
  list: ContainmentOptions
  image: ContainmentOptions
}

class CSSContainmentManager {
  private observers = new Map<string, IntersectionObserver>()
  private containedElements = new Map<string, HTMLElement>()
  private viewportOptimizations = new Set<string>()
  
  private defaultConfig: ContainmentConfig = {
    message: {
      layout: true,
      paint: true,
      style: true,
      containIntrinsicSize: "0 120px",
      contentVisibility: 'auto',
      viewportOptimization: true,
      intersectionThreshold: 0.1
    },
    tool: {
      layout: true,
      paint: true,
      size: false,
      style: true,
      containIntrinsicSize: "0 200px",
      contentVisibility: 'auto',
      viewportOptimization: true,
      intersectionThreshold: 0.1
    },
    code: {
      layout: true,
      paint: true,
      style: true,
      containIntrinsicSize: "0 300px",
      contentVisibility: 'auto',
      viewportOptimization: true,
      intersectionThreshold: 0.1
    },
    list: {
      layout: true,
      paint: true,
      style: true,
      containIntrinsicSize: "0 100px",
      contentVisibility: 'auto',
      viewportOptimization: true,
      intersectionThreshold: 0.05
    },
    image: {
      layout: true,
      paint: true,
      size: true,
      style: true,
      containIntrinsicSize: "0 200px",
      contentVisibility: 'auto',
      viewportOptimization: true,
      intersectionThreshold: 0.1
    }
  }
  
  // Apply containment to an element
  applyContainment(element: HTMLElement, contentType: keyof ContainmentConfig, customOptions?: Partial<ContainmentOptions>): void {
    const config = { ...this.defaultConfig[contentType], ...customOptions }
    const elementId = this.generateElementId(element)
    
    // Store element reference
    this.containedElements.set(elementId, element)
    
    // Apply CSS containment
    this.applyCSSContainment(element, config)
    
    // Apply viewport optimization if enabled
    if (config.viewportOptimization) {
      this.setupViewportOptimization(elementId, element, config)
    }
  }
  
  // Apply CSS containment properties
  private applyCSSContainment(element: HTMLElement, config: ContainmentOptions): void {
    const styles: Record<string, string> = {}
    
    // Build containment string
    const containmentTypes: string[] = []
    if (config.layout) containmentTypes.push('layout')
    if (config.paint) containmentTypes.push('paint')
    if (config.size) containmentTypes.push('size')
    if (config.style) containmentTypes.push('style')
    
    if (containmentTypes.length > 0) {
      styles.contain = containmentTypes.join(' ')
    }
    
    // Content visibility
    if (config.contentVisibility) {
      styles['content-visibility'] = config.contentVisibility
    }
    
    // Intrinsic size
    if (config.containIntrinsicSize) {
      styles['contain-intrinsic-size'] = config.containIntrinsicSize
    }
    
    // Performance hints
    if (config.willChange) {
      styles['will-change'] = config.willChange
    }
    
    if (config.transform) {
      styles.transform = config.transform
    }
    
    // Apply styles
    Object.assign(element.style, styles)
  }
  
  // Setup viewport-based optimization
  private setupViewportOptimization(elementId: string, element: HTMLElement, config: ContainmentOptions): void {
    if (!config.intersectionThreshold) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const isVisible = entry.isIntersecting
          
          if (isVisible) {
            // Element is visible - ensure it's rendered
            element.style.display = ''
            element.style.visibility = 'visible'
            this.viewportOptimizations.add(elementId)
          } else {
            // Element is off-screen - optimize rendering
            if (config.contentVisibility !== 'visible') {
              element.style.display = 'none'
            }
            this.viewportOptimizations.delete(elementId)
          }
        })
      },
      {
        threshold: config.intersectionThreshold,
        rootMargin: '50px' // Start optimizing 50px before viewport
      }
    )
    
    observer.observe(element)
    this.observers.set(elementId, observer)
  }
  
  // Remove containment from an element
  removeContainment(element: HTMLElement): void {
    const elementId = this.generateElementId(element)
    
    // Remove containment styles
    element.style.removeProperty('contain')
    element.style.removeProperty('content-visibility')
    element.style.removeProperty('contain-intrinsic-size')
    element.style.removeProperty('will-change')
    element.style.removeProperty('transform')
    
    // Clean up viewport optimization
    const observer = this.observers.get(elementId)
    if (observer) {
      observer.disconnect()
      this.observers.delete(elementId)
    }
    
    this.viewportOptimizations.delete(elementId)
    this.containedElements.delete(elementId)
  }
  
  // Generate unique element ID
  private generateElementId(element: HTMLElement): string {
    if (!element.dataset.containmentId) {
      element.dataset.containmentId = `containment-${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
    return element.dataset.containmentId
  }
  
  // Get containment statistics
  getStats() {
    return {
      containedElements: this.containedElements.size,
      viewportOptimized: this.viewportOptimizations.size,
      activeObservers: this.observers.size
    }
  }
  
  // Cleanup all resources
  cleanup(): void {
    // Disconnect all observers
    for (const observer of this.observers.values()) {
      observer.disconnect()
    }
    
    // Clear all collections
    this.observers.clear()
    this.containedElements.clear()
    this.viewportOptimizations.clear()
  }
}

// Global containment manager
export const containmentManager = new CSSContainmentManager()

// Containment component for SolidJS
interface ContainedProps {
  children: JSX.Element
  type: keyof ContainmentConfig
  options?: Partial<ContainmentOptions>
  class?: string
  style?: Record<string, string>
}

export function Contained(props: ContainedProps): JSX.Element {
  let elementRef: HTMLDivElement | undefined
  
  createEffect(() => {
    if (!elementRef) return
    
    // Apply containment
    containmentManager.applyContainment(elementRef, props.type, props.options)
    
    // Apply custom styles
    if (props.style) {
      Object.assign(elementRef.style, props.style)
    }
    
    onCleanup(() => {
      if (elementRef) {
        containmentManager.removeContainment(elementRef)
      }
    })
  })
  
  return (
    <div 
      ref={elementRef}
      class={`contained-element contained-${props.type} ${props.class || ''}`}
      data-contained-type={props.type}
    >
      {props.children}
    </div>
  )
}

// Specialized containment components
export function ContainedMessage(props: { children: JSX.Element; class?: string }): JSX.Element {
  return (
    <Contained type="message" class={props.class}>
      {props.children}
    </Contained>
  )
}

export function ContainedTool(props: { children: JSX.Element; class?: string }): JSX.Element {
  return (
    <Contained type="tool" class={props.class}>
      {props.children}
    </Contained>
  )
}

export function ContainedCode(props: { children: JSX.Element; class?: string }): JSX.Element {
  return (
    <Contained type="code" class={props.class}>
      {props.children}
    </Contained>
  )
}

export function ContainedList(props: { children: JSX.Element; class?: string }): JSX.Element {
  return (
    <Contained type="list" class={props.class}>
      {props.children}
    </Contained>
  )
}

export function ContainedImage(props: { children: JSX.Element; class?: string }): JSX.Element {
  return (
    <Contained type="image" class={props.class}>
      {props.children}
    </Contained>
  )
}

// Advanced containment with lazy loading
interface LazyContainedProps extends ContainedProps {
  defer?: boolean
  deferDelay?: number
}

export function LazyContained(props: LazyContainedProps): JSX.Element {
  let elementRef: HTMLDivElement | undefined
  const [isVisible, setIsVisible] = createSignal(false)
  const [shouldRender, setShouldRender] = createSignal(!props.defer)
  
  createEffect(() => {
    if (!elementRef) return
    
    // Setup intersection observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false
        
        if (visible && !isVisible()) {
          setIsVisible(true)
          
          if (props.defer) {
            // Deferred rendering
            setTimeout(() => {
              setShouldRender(true)
              containmentManager.applyContainment(elementRef!, props.type, props.options)
            }, props.deferDelay ?? 100)
          } else {
            // Immediate rendering
            setShouldRender(true)
            containmentManager.applyContainment(elementRef, props.type, props.options)
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    )
    
    observer.observe(elementRef)
    
    onCleanup(() => {
      observer.disconnect()
      if (elementRef) {
        containmentManager.removeContainment(elementRef)
      }
    })
  })
  
  return (
    <div 
      ref={elementRef}
      class={`lazy-contained-element lazy-contained-${props.type} ${props.class || ''}`}
      data-contained-type={props.type}
      data-lazy-contained="true"
    >
      {shouldRender() ? props.children : (
        <div class="contained-placeholder" style={{
          'contain-intrinsic-size': props.options?.containIntrinsicSize || '0 100px',
          'background-color': 'var(--color-bg-secondary)',
          border: '1px dashed var(--color-border-primary)',
          'border-radius': '4px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'var(--color-text-secondary)',
          'font-size': '12px'
        }}>
          Loading...
        </div>
      )}
    </div>
  )
}

// Performance monitoring for containment
export function useContainmentStats() {
  const [stats, setStats] = createSignal(containmentManager.getStats())
  
  createEffect(() => {
    const interval = setInterval(() => {
      setStats(containmentManager.getStats())
    }, 3000)
    
    onCleanup(() => clearInterval(interval))
  })
  
  return stats
}

// Utility function to apply containment to existing elements
export function applyContainmentToElement(
  element: HTMLElement, 
  contentType: keyof ContainmentConfig, 
  options?: Partial<ContainmentOptions>
): void {
  containmentManager.applyContainment(element, contentType, options)
}

// Utility function to create containment CSS classes
export function createContainmentCSS(): string {
  return `
    .contained-element {
      box-sizing: border-box;
    }
    
    .contained-message {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 0 120px;
    }
    
    .contained-tool {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 0 200px;
    }
    
    .contained-code {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 0 300px;
    }
    
    .contained-list {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 0 100px;
    }
    
    .contained-image {
      contain: layout paint size style;
      content-visibility: auto;
      contain-intrinsic-size: 0 200px;
    }
    
    .lazy-contained-element:not([data-lazy-visible="true"]) {
      content-visibility: hidden;
    }
    
    .contained-placeholder {
      contain: layout;
      content-visibility: auto;
    }
  `
}

// Export types
export type { ContainmentOptions, ContainmentConfig, ContainedProps, LazyContainedProps }
