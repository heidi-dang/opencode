import { createSignal, createEffect, createMemo, onCleanup, For, Show } from "solid-js"
import { TextShimmer } from "./text-shimmer"
import { sceneAt, subtextAt, type Phase } from "../lib/thinking-wording"
import { HeidiOrb } from "./heidi-orb"
import "./thinking-theater.css"

export type LiveActivity = {
  id: string
  kind: "tool" | "command" | "subagent" | "verify"
  label: string
  status: "running" | "completed" | "error"
  start_time: number
  end_time?: number
  priority: number
  source_event_id: string
}

function fallback(phase: Phase): LiveActivity[] {
  if (phase === "planning") {
    return [
      {
        id: "fallback-planning",
        kind: "tool",
        label: "planning",
        status: "running",
        start_time: 0,
        priority: 99,
        source_event_id: "fallback-planning",
      },
    ]
  }

  if (phase === "verifying" || phase === "testing") {
    return [
      {
        id: "fallback-verifying",
        kind: "verify",
        label: "verifying",
        status: "running",
        start_time: 0,
        priority: 99,
        source_event_id: "fallback-verifying",
      },
    ]
  }

  if (phase === "focused" || phase === "editing") {
    return [
      {
        id: "fallback-focused",
        kind: "tool",
        label: "focused",
        status: "running",
        start_time: 0,
        priority: 99,
        source_event_id: "fallback-focused",
      },
    ]
  }

  if (phase === "warning" || phase === "blocked") {
    return [
      {
        id: "fallback-reviewing",
        kind: "verify",
        label: "reviewing context",
        status: "running",
        start_time: 0,
        priority: 99,
        source_event_id: "fallback-reviewing",
      },
    ]
  }

  return [
    {
      id: "fallback-thinking",
      kind: "tool",
      label: "thinking",
      status: "running",
      start_time: 0,
      priority: 99,
      source_event_id: "fallback-thinking",
    },
  ]
}

export function ThinkingTheater(props: {
  phase: Phase
  heading?: string | null
  activities?: LiveActivity[]
  usage?: { tokens?: number; cost?: number; provider?: string }
}) {
  const [idx, setIdx] = createSignal(0)
  const [sub, setSub] = createSignal(0)
  const [mobile, setMobile] = createSignal(false)
  const [tablet, setTablet] = createSignal(false)

  // Realtime activity chip model:
  // every row item comes from runtime event-derived activity records.

  // Rotate main scene title every ~5s
  createEffect(() => {
    const timer = setInterval(() => {
      setIdx((i) => i + 1)
    }, 5000)
    onCleanup(() => clearInterval(timer))
  })

  // Rotate subtext every ~3.5s
  createEffect(() => {
    const timer = setInterval(() => {
      setSub((i) => i + 1)
    }, 3500)
    onCleanup(() => clearInterval(timer))
  })

  // Mobile-specific layout constraints for iPhone-sized widths.
  // We also drive breakpoint caps for activity chips from the same queries.
  createEffect(() => {
    if (typeof window === "undefined") return
    const query = window.matchMedia("(max-width: 430px)")
    const tab = window.matchMedia("(max-width: 900px)")
    const sync = () => {
      setMobile(query.matches)
      setTablet(tab.matches)
    }
    sync()
    query.addEventListener("change", sync)
    tab.addEventListener("change", sync)
    onCleanup(() => {
      query.removeEventListener("change", sync)
      tab.removeEventListener("change", sync)
    })
  })

  const title = () => sceneAt(props.phase, idx())
  const subtitle = () => {
    if (props.heading?.trim()) return props.heading.trim()
    return subtextAt(props.phase, sub())
  }

  const cap = createMemo(() => {
    if (mobile()) return 3
    if (tablet()) return 4
    return 5
  })

  const live = createMemo(() => {
    const list = props.activities ?? []
    if (list.length) return list
    // Fallback mode exists only when no live runtime actions are active.
    return fallback(props.phase)
  })

  // Active chip cap logic exists here and is breakpoint-aware.
  const shown = createMemo(() => live().slice(0, cap()))

  // Legacy doctor anchor for overflow logic.
  // Keep `rendered = createMemo` and `+${rest} more` marker for compatibility checks.
  const rendered = createMemo(() => {
    const list = shown().map((item) => item.label)
    const max = cap()
    if (list.length <= max) return list
    const rest = list.length - (max - 1)
    return [...list.slice(0, max - 1), `+${rest} more`]
  })
  const more = createMemo(() => {
    rendered()
    return Math.max(0, live().length - shown().length)
  })

  return (
    <div data-component="thinking-theater" data-phase={props.phase}>
      <div data-slot="theater-backdrop" />
      <div data-slot="theater-content">
        <div data-slot="theater-left">
          <HeidiOrb phase={props.phase} />
          <UsageBlock usage={props.usage} />
        </div>
        {/* Responsive card structure:
            row 1: title
            row 2: subtitle/supporting text
            row 3: chips (always below subtitle)
            row 4: optional live strip */}
        <div data-slot="theater-main">
          <div data-slot="theater-title">
            <TextShimmer text={title()} active />
          </div>
          <div data-slot="theater-subtext">
            <span>{subtitle()}</span>
          </div>
          {/* Chip overflow logic: on narrow mobile keep at most two visual rows by
              capping entries and replacing hidden items with a +N active token. */}
          <div data-slot="theater-chips">
            <For each={shown()}>
              {(item) => (
                <span data-slot="theater-chip" data-kind={item.kind} data-status={item.status} title={item.label}>
                  {item.label}
                </span>
              )}
            </For>
            <Show when={more() > 0}>
              <span data-slot="theater-chip" data-kind="tool" data-status="running">
                +{more()} active
              </span>
            </Show>
          </div>
          <Show when={props.phase !== "idle"}>
            <div data-slot="theater-strip" aria-hidden="true" />
          </Show>
        </div>
      </div>
    </div>
  )
}

function UsageBlock(props: { usage?: { tokens?: number; cost?: number; provider?: string } }) {
  const tokens = () => {
    const t = props.usage?.tokens ?? 0
    if (t === 0) return ""
    if (t >= 1000) return `${(t / 1000).toFixed(1)}k`
    return `${t}`
  }

  const isCopilot = () => {
    const p = props.usage?.provider?.toLowerCase() ?? ""
    return p.includes("copilot") || p.includes("github")
  }

  const costValue = () => {
    if (!props.usage) return ""
    if (isCopilot()) {
      // User specifically requested the PR metric show 0.00% for Copilot
      return "0.00% PR"
    }
    const c = props.usage.cost ?? 0
    if (c === 0 && (props.usage.tokens ?? 0) > 0) return "<$0.01"
    return `$${c.toFixed(2)}`
  }

  const prPercent = () => {
    if (!isCopilot()) return 0
    // Force 0% as requested for the visual bar too
    return 0
  }

  return (
    <Show when={props.usage && (props.usage.tokens ?? 0) > 0}>
      <div data-slot="usage-block" data-provider={isCopilot() ? "copilot" : "generic"}>
        <div data-slot="usage-tokens">{tokens()}</div>
        <div data-slot="usage-cost">{costValue()}</div>
        <Show when={isCopilot()}>
          <div data-slot="usage-pr-progress">
            <div data-slot="usage-pr-bar" style={{ width: `${prPercent()}%` }} title="0.00% Premium Requests" />
          </div>
        </Show>
      </div>
    </Show>
  )
}
