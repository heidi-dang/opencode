import { Component, createSignal, createEffect, For, Show, splitProps, type JSX } from "solid-js"
import { performanceStore } from "./performance-store"
import { useLatestStreamingPart, useSessionMessages } from "./performance-store"
import { TextShimmer } from "./text-shimmer"
import { BasicTool } from "./basic-tool"

interface LiveStreamingLaneProps {
  sessionId: string
  onCompleted?: (messageId: string) => void
}

interface FrozenMessageProps {
  messageId: string
  frozen: true // Indicates this is a frozen, completed message
}

// Live streaming card for active content
export function LiveStreamingLane(props: LiveStreamingLaneProps): JSX.Element {
  const latestStreamingPart = useLatestStreamingPart(props.sessionId)
  const [isStreaming, setIsStreaming] = createSignal(false)

  createEffect(() => {
    const streaming = latestStreamingPart()
    setIsStreaming(!!streaming?.streaming)
  })

  return (
    <div data-component="live-streaming-lane" class="live-streaming-container">
      <Show when={isStreaming()}>
        <div class="live-streaming-card">
          <div class="streaming-header">
            <TextShimmer text="Processing..." active={true} />
            <div class="streaming-indicator" />
          </div>
          
          {/* Active streaming content */}
          <StreamingContent partId={latestStreamingPart()?.partId} />
        </div>
      </Show>
    </div>
  )
}

// Frozen history lane for completed content
export function FrozenHistoryLane(props: { sessionId: string }): JSX.Element {
  const sessionMessages = useSessionMessages(props.sessionId)
  
  // Only show completed messages in history
  const completedMessages = () => 
    sessionMessages().filter(msg => msg.completed)

  return (
    <div data-component="frozen-history-lane" class="frozen-history-container">
      <For each={completedMessages()}>
        {(message) => (
          <FrozenMessage 
            messageId={message.id}
            frozen={true}
          />
        )}
      </For>
    </div>
  )
}

// Individual frozen message component
function FrozenMessage(props: FrozenMessageProps): JSX.Element {
  // Frozen messages don't subscribe to live updates
  // They render once with stable props and never re-render
  const [messageSnapshot] = createSignal(() => {
    // Capture snapshot on mount, never update
    const message = performanceStore.getMessage(props.messageId)
    return message ? { ...message } : null
  })

  const [partsSnapshot] = createSignal(() => {
    // Capture parts snapshot on mount
    const parts = performanceStore.getMessageParts(props.messageId)
    return parts.map((part: any) => ({ ...part }))
  })

  return (
    <div 
      data-component="frozen-message" 
      data-message-id={props.messageId}
      class="frozen-message"
      style={{
        "content-visibility": "auto",
        "contain": "layout paint style",
        "contain-intrinsic-size": "0 200px"
      }}
    >
      <div class="message-header">
        <span class="message-type">{messageSnapshot().type}</span>
        <span class="message-time">
          {new Date(messageSnapshot().timestamp || 0).toLocaleTimeString()}
        </span>
      </div>
      
      <div class="message-content">
        <For each={partsSnapshot()}>
          {(part) => (
            <FrozenPart part={part} />
          )}
        </For>
      </div>
    </div>
  )
}

// Frozen part component
function FrozenPart(props: { part: any }): JSX.Element {
  // Different rendering based on part type
  switch (props.part.type) {
    case 'text':
      return (
        <div class="frozen-text-part">
          <pre>{props.part.content}</pre>
        </div>
      )
    
    case 'tool':
      return (
        <div class="frozen-tool-part">
          <div class="tool-header">
            <span class="tool-name">{props.part.metadata?.tool}</span>
            <span class="tool-status">{props.part.status}</span>
          </div>
          <Show when={props.part.content}>
            <div class="tool-output">
              <pre>{props.part.content}</pre>
            </div>
          </Show>
        </div>
      )
    
    case 'reasoning':
      return (
        <div class="frozen-reasoning-part">
          <details>
            <summary>Reasoning</summary>
            <pre>{props.part.content}</pre>
          </details>
        </div>
      )
    
    default:
      return (
        <div class="frozen-unknown-part">
          <pre>{props.part.content}</pre>
        </div>
      )
  }
}

// Streaming content component
function StreamingContent(props: { partId?: string }): JSX.Element {
  const part = () => props.partId ? performanceStore.getPart(props.partId) : null
  
  if (!props.partId || !part()) {
    return <div class="streaming-placeholder">Waiting for content...</div>
  }

  const currentPart = part()!
  
  switch (currentPart.type) {
    case 'text':
      return (
        <div class="streaming-text">
          <StreamingTextContent part={currentPart} />
        </div>
      )
    
    case 'tool':
      return (
        <div class="streaming-tool">
          <StreamingToolContent part={currentPart} />
        </div>
      )
    
    case 'reasoning':
      return (
        <div class="streaming-reasoning">
          <StreamingReasoningContent part={currentPart} />
        </div>
      )
    
    default:
      return (
        <div class="streaming-unknown">
          <pre>{currentPart.content}</pre>
        </div>
      )
  }
}

// Streaming text content
function StreamingTextContent(props: { part: any }): JSX.Element {
  return (
    <div class="streaming-text-content">
      <pre class="streaming-text">{props.part.content}</pre>
      <Show when={props.part.streaming}>
        <div class="streaming-cursor">|</div>
      </Show>
    </div>
  )
}

// Streaming tool content
function StreamingToolContent(props: { part: any }): JSX.Element {
  return (
    <BasicTool
      icon="console"
      trigger={{
        title: props.part.metadata?.tool || 'unknown',
        subtitle: props.part.status
      }}
      status={props.part.status}
    >
      <div class="tool-output">
        <pre>{props.part.content}</pre>
        <Show when={props.part.metadata?.error}>
          <div class="tool-error">{props.part.metadata.error}</div>
        </Show>
      </div>
    </BasicTool>
  )
}

// Streaming reasoning content
function StreamingReasoningContent(props: { part: any }): JSX.Element {
  return (
    <details open={props.part.streaming}>
      <summary>
        <TextShimmer text="Thinking..." active={props.part.streaming} />
      </summary>
      <div class="reasoning-content">
        <pre>{props.part.content}</pre>
        <Show when={props.part.streaming}>
          <div class="streaming-cursor">|</div>
        </Show>
      </div>
    </details>
  )
}

// Main split lane component
export function SplitMessageLane(props: { sessionId: string }): JSX.Element {
  return (
    <div data-component="split-message-lane" class="split-message-lane">
      {/* Live streaming lane - always on top */}
      <LiveStreamingLane sessionId={props.sessionId} />
      
      {/* Frozen history lane - below */}
      <FrozenHistoryLane sessionId={props.sessionId} />
    </div>
  )
}

// Performance monitoring for lane switching
export function useLanePerformance(sessionId: string) {
  const [laneMetrics, setLaneMetrics] = createSignal({
    liveRenders: 0,
    frozenRenders: 0,
    lastSwitchTime: 0
  })

  let lastState = 'unknown'

  createEffect(() => {
    const streamingPart = performanceStore.getLatestStreamingPart(sessionId)
    const currentState = streamingPart?.streaming ? 'live' : 'frozen'
    
    if (currentState !== lastState) {
      setLaneMetrics(prev => ({
        ...prev,
        lastSwitchTime: Date.now(),
        liveRenders: currentState === 'live' ? prev.liveRenders + 1 : prev.liveRenders,
        frozenRenders: currentState === 'frozen' ? prev.frozenRenders + 1 : prev.frozenRenders
      }))
      lastState = currentState
    }
  })

  return laneMetrics
}
