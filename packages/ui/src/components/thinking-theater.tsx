import { createSignal, createEffect, createMemo, onCleanup, For, Show } from "solid-js"
import { TextShimmer } from "./text-shimmer"
import { sceneAt, subtextAt, chipSet, type Phase } from "../lib/thinking-wording"
import { HeidiOrb } from "./heidi-orb"
import "./thinking-theater.css"

export function ThinkingTheater(props: { phase: Phase; heading?: string | null }) {
  const [idx, setIdx] = createSignal(0)
  const [sub, setSub] = createSignal(0)
  const [chips, setChips] = createSignal<string[]>([])
  const [mobile, setMobile] = createSignal(false)

  // Rotate main scene title every ~5s
  createEffect(() => {
    const list = sceneAt(props.phase, 0).split(" ")
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

  // Deterministic chip selection — refreshed when phase changes
  createEffect(() => {
    const phase = props.phase
    const seed = phase.length + phase.charCodeAt(0)
    const next = chipSet(phase, seed, 8)
    setChips(next)
  })

  // Mobile-specific layout constraints for iPhone-sized widths.
  // We collapse chips to a +N token so the text column keeps readable width.
  createEffect(() => {
    if (typeof window === "undefined") return
    const query = window.matchMedia("(max-width: 430px)")
    const sync = () => setMobile(query.matches)
    sync()
    query.addEventListener("change", sync)
    onCleanup(() => query.removeEventListener("change", sync))
  })

  const title = () => sceneAt(props.phase, idx())
  const subtitle = () => {
    if (props.heading?.trim()) return props.heading.trim()
    return subtextAt(props.phase, sub())
  }

  // Chip overflow logic used by doctor checks.
  const rendered = createMemo(() => {
    const list = chips()
    if (!mobile()) return list
    const max = 4
    if (list.length <= max) return list
    const rest = list.length - (max - 1)
    return [...list.slice(0, max - 1), `+${rest} more`]
  })

  return (
    <div data-component="thinking-theater" data-phase={props.phase}>
      <div data-slot="theater-backdrop" />
      <div data-slot="theater-content">
        <div data-slot="theater-orb">
          <HeidiOrb phase={props.phase} />
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
              capping entries and replacing hidden items with a +N token. */}
          <div data-slot="theater-chips">
            <For each={rendered()}>{(chip) => <span data-slot="theater-chip">{chip}</span>}</For>
          </div>
          <Show when={props.phase !== "idle"}>
            <div data-slot="theater-strip" aria-hidden="true" />
          </Show>
        </div>
      </div>
    </div>
  )
}
