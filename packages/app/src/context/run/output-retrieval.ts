import { createSignal, createResource } from "solid-js"
import { sdk } from "@/context/sdk"

/**
 * Hook to retrieve full tool output on demand
 * 
 * This provides lazy loading of full output when user clicks "show more"
 * instead of loading everything upfront.
 */

export interface ToolOutputRef {
  messageID: string
  partID: string
  outputRef?: string
  outputHasMore?: boolean
  outputBytes?: number
  previewLines?: number
  previewBytes?: number
}

export function useToolOutputRetrieval() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  
  /**
   * Retrieve full output from blob storage
   * This calls the backend API to fetch the full output
   */
  async function retrieveFullOutput(messageID: string, partID: string): Promise<string | null> {
    setLoading(true)
    setError(null)
    
    try {
      // Call backend API to retrieve full output
      // The backend will use retrieveFullOutput from truncation.ts
      const response = await sdk.runAction("tool.retrieveOutput", {
        messageID,
        partID,
      })
      
      if (response?.data?.output) {
        return response.data.output
      }
      
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to retrieve output"
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }
  
  /**
   * Check if output should be retrieved (not just preview)
   */
  function shouldRetrieve(ref: ToolOutputRef): boolean {
    return !!ref.outputRef && !!ref.outputHasMore
  }
  
  /**
   * Get output size description
   */
  function getSizeDescription(ref: ToolOutputRef): string {
    if (!ref.outputBytes) return ""
    
    const kb = Math.round(ref.outputBytes / 1024)
    if (kb < 1024) {
      return `${kb} KB`
    }
    return `${(kb / 1024).toFixed(1)} MB`
  }
  
  /**
   * Get preview line count description
   */
  function getLineDescription(ref: ToolOutputRef): string {
    if (!ref.previewLines) return ""
    return `${ref.previewLines} lines`
  }
  
  return {
    loading,
    error,
    retrieveFullOutput,
    shouldRetrieve,
    getSizeDescription,
    getLineDescription,
  }
}

/**
 * Component props for a tool output with "show more" functionality
 */
export interface ToolOutputProps {
  messageID: string
  partID: string
  preview: string
  outputRef?: string
  outputHasMore?: boolean
  outputBytes?: number
  previewLines?: number
  onShowMore?: () => void
}

export function createToolOutputState(initialPreview: string) {
  const [preview, setPreview] = createSignal(initialPreview)
  const [fullOutput, setFullOutput] = createSignal<string | null>(null)
  const [showFull, setShowFull] = createSignal(false)
  
  const { loading, error, retrieveFullOutput } = useToolOutputRetrieval()
  
  async function loadFullOutput(messageID: string, partID: string) {
    const output = await retrieveFullOutput(messageID, partID)
    if (output) {
      setFullOutput(output)
      setShowFull(true)
    }
  }
  
  function toggleFull() {
    if (!showFull()) {
      // Need to load full output first
      return false
    }
    setShowFull(!showFull())
    return true
  }
  
  const displayOutput = () => showFull() && fullOutput() ? fullOutput()! : preview()
  
  const hasMore = () => !!fullOutput() || showFull()
  
  return {
    preview,
    fullOutput,
    showFull,
    loading,
    error,
    displayOutput,
    hasMore,
    loadFullOutput,
    toggleFull,
  }
}
