import { createSignal, onMount, onCleanup, createEffect } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createDeltaBatcher, type BatchedUpdate } from "./delta-batcher"
import { useGlobalSDK } from "@/context/global-sdk"
import { createLiveRunStore, type RunStatus } from "./index"

// Constants
const MAX_RECENT_STEPS = 5
const MAX_PREVIEW_LINES = 5

/**
 * Live Run Provider - connects SDK events to live run store
 * 
 * This provider subscribes to SDK events and updates the live run store
 * for real-time UI updates during agent execution.
 */
export function createLiveRunProvider() {
  const sdk = useGlobalSDK()
  
  // Create the live run store
  const runStore = createLiveRunStore({
    maxRecentSteps: MAX_RECENT_STEPS,
    maxPreviewLines: MAX_PREVIEW_LINES,
  })
  
  // Track current active run
  const [currentRunID, setCurrentRunID] = createSignal<string | null>(null)
  const [currentSessionID, setCurrentSessionID] = createSignal<string | null>(null)
  
  // Subscribe to SDK events
  onMount(() => {
    const unsubscribe = sdk.event.listen((event: { type: string; directory?: string; details?: Record<string, unknown>; properties?: Record<string, unknown> }) => {
      handleSDKEvent(event)
    })
    
    onCleanup(() => {
      unsubscribe()
    })
  })
  
  /**
   * Handle SDK events and update run store
   */
  function handleSDKEvent(event: any) {
    // Handle message created - new assistant message starts a run
    if (event.type === "message.created" && event.details?.role === "assistant") {
      const sessionID = event.directory
      const messageID = event.details.id
      
      setCurrentSessionID(sessionID)
      setCurrentRunID(messageID)
      
      runStore.startRun(messageID, sessionID, "thinking")
      return
    }
    
    // Handle part delta - streaming output
    if (event.type === "message.part.delta") {
      const { messageID, partID, delta } = event.properties
      
      if (currentRunID() === messageID) {
        runStore.addDelta(messageID, partID, delta)
      }
      return
    }
    
    // Handle part updated - tool state changes
    if (event.type === "message.part.updated") {
      const { messageID, partID, part } = event.properties
      
      if (currentRunID() === messageID) {
        handlePartUpdate(messageID, part)
      }
      return
    }
    
    // Handle message completed
    if (event.type === "message.completed") {
      const messageID = event.details?.id
      
      if (currentRunID() === messageID) {
        runStore.setStatus(messageID, "completed")
        runStore.freezeRun(messageID)
      }
      return
    }
    
    // Handle errors
    if (event.type === "message.error") {
      const messageID = event.details?.id
      
      if (currentRunID() === messageID) {
        runStore.setStatus(messageID, "failed")
        runStore.freezeRun(messageID)
      }
      return
    }
  }
  
  /**
   * Handle part update events
   */
  function handlePartUpdate(messageID: string, part: any) {
    if (part.type !== "tool") return
    
    const state = part.state as any
    if (!state) return
    
    // Map tool status to run status
    const status = mapToolStatusToRun(state.status)
    if (status) {
      runStore.setStatus(messageID, status)
    }
    
    // Track current step
    if (state.status === "running" && state.title) {
      runStore.setCurrentStep(messageID, part.id, state.title)
    }
    
    // Complete step when done
    if (state.status === "completed" || state.status === "error") {
      runStore.completeStep(
        messageID,
        part.id,
        state.status === "completed" ? "success" : "error",
        state.output?.slice(-500) // Last 500 chars as preview
      )
    }
  }
  
  /**
   * Map tool state status to run status
   */
  function mapToolStatusToRun(toolStatus: string): RunStatus | null {
    switch (toolStatus) {
      case "pending":
        return "pending"
      case "running":
        return "running"
      case "completed":
        return "completed"
      case "error":
        return "failed"
      default:
        return null
    }
  }
  
  /**
   * Get run info for UI display
   */
  function getCurrentRun() {
    const runID = currentRunID()
    if (!runID) return null
    
    return runStore.getRun(runID)
  }
  
  /**
   * Get preview with "load more" indicator
   */
  function getRunPreview(runID: string) {
    const run = runStore.getRun(runID)
    if (!run) return null
    
    return {
      preview: run.preview,
      hasMore: run.preview && run.preview.split("\n").length >= MAX_PREVIEW_LINES,
    }
  }
  
  return {
    // Expose store
    runs: runStore.runs,
    
    // Current run tracking
    currentRunID,
    currentSessionID,
    
    // Methods
    getCurrentRun,
    getRunPreview,
    startRun: runStore.startRun,
    setStatus: runStore.setStatus,
    freezeRun: runStore.freezeRun,
    flushDeltas: runStore.flushDeltas,
  }
}

// Create the context
import { createSimpleContext } from "@opencode-ai/ui/context"

export const { use: useLiveRun, provider: LiveRunProvider } = createSimpleContext({
  name: "LiveRun",
  init: createLiveRunProvider,
})
