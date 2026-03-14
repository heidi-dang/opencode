import { Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useToolOutputRetrieval, type ToolOutputProps } from "./output-retrieval"

export function ToolOutputShowMore(props: ToolOutputProps) {
  const [showFull, setShowFull] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [fullOutput, setFullOutput] = createSignal<string | null>(null)

  const hasMore = () => props.outputHasMore && !showFull()

  async function loadFullOutput() {
    if (!props.outputRef) return
    
    setLoading(true)
    try {
      // Call the API to get full output
      const response = await fetch(
        `/api/session/-/tool-output/${props.messageID}/${props.partID}`
      )
      const data = await response.json()
      if (data.output) {
        setFullOutput(data.output)
        setShowFull(true)
      }
    } catch (err) {
      console.error("Failed to load full output:", err)
    } finally {
      setLoading(false)
    }
  }

  function toggleFull() {
    if (hasMore() && !showFull() && !fullOutput()) {
      loadFullOutput()
    } else {
      setShowFull(!showFull())
    }
  }

  const displayOutput = () => {
    if (showFull() && fullOutput()) {
      return fullOutput()!
    }
    return props.preview
  }

  return (
    <div class="tool-output">
      <pre class="whitespace-pre-wrap text-sm font-mono">
        {displayOutput()}
      </pre>
      
      <Show when={hasMore()}>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFull}
          disabled={loading()}
        >
          {loading() 
            ? "Loading..." 
            : showFull() 
              ? "Show less" 
              : `Show full output (${Math.round((props.outputBytes ?? 0) / 1024)} KB)`
          }
        </Button>
      </Show>
    </div>
  )
}

/**
 * Compact tool output for inline display
 * Shows preview with optional expand button
 */
export function CompactToolOutput(props: {
  preview: string
  outputHasMore?: boolean
  outputBytes?: number
  onExpand?: () => void
}) {
  const [expanded, setExpanded] = createSignal(false)

  const toggle = () => {
    setExpanded(!expanded())
    if (!expanded() && props.onExpand) {
      props.onExpand()
    }
  }

  return (
    <div class="compact-tool-output">
      <pre class="whitespace-pre-wrap text-xs font-mono text-text-weak">
        {expanded() ? props.preview : props.preview.split("\n").slice(-3).join("\n")}
      </pre>
      
      <Show when={props.outputHasMore}>
        <button
          class="text-xs text-text-weaker hover:text-text-weak"
          onClick={toggle}
        >
          {expanded() ? "[-]" : `[+ ${props.outputBytes ? Math.round(props.outputBytes / 1024) + ' KB' : 'more'}]`}
        </button>
      </Show>
    </div>
  )
}
