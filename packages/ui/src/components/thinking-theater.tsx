import { createSignal, createEffect, createMemo, onCleanup, For, Show } from "solid-js"
import { TextShimmer } from "./text-shimmer"
import { scenes, SUBTEXTS, THOUGHT_CHIPS, type Phase } from "../lib/thinking-wording"
import { HeidiOrb } from "./heidi-orb"
import "./thinking-theater.css"

export function ThinkingTheater(props: { phase: Phase; heading?: string | null }) {
  // Scene rotation — every 5s
  const [idx, setIdx] = createSignal(0)
  const [sub, setSub] = createSignal(0)
  const [chips, setChips] = createSignal<string[]>([])
  const [mobile, setMobile] = createSignal(false)

  // Rotate main scene
  createEffect(() => {
    const list = scenes(props.phase)
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % list.length)
    }, 5000)
    onCleanup(() => clearInterval(timer))
  })

  // Rotate subtext
  createEffect(() => {
    const timer = setInterval(() => {
      setSub((i) => (i + 1) % SUBTEXTS.length)
    }, 3500)
    onCleanup(() => clearInterval(timer))
  })

  // Pop thought chips
  createEffect(() => {
    const timer = setInterval(() => {
      const pool = THOUGHT_CHIPS
      const pick = pool[Math.floor(Math.random() * pool.length)]
      setChips((prev) => {
        const next = [...prev, pick].slice(-8)
        return next
      })
    }, 2800)
    onCleanup(() => clearInterval(timer))
  })

  // Fade out old chips
  createEffect(() => {
    const timer = setInterval(() => {
      setChips((prev) => prev.slice(1))
    }, 5200)
    onCleanup(() => clearInterval(timer))
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

  const scene = () => {
    const list = scenes(props.phase)
    return list[idx() % list.length]
  }

  const subtext = () => SUBTEXTS[sub() % SUBTEXTS.length]

  // Chip overflow logic used by doctor checks.
  const rendered = createMemo(() => {
    const list = chips()
    if (!mobile()) return list
    const max = 4
    if (list.length <= max) return list
    const rest = list.length - (max - 1)
    return [...list.slice(0, max - 1), `+${rest} more`]
  })

  const subtitle = createMemo(() => {
    if (!props.heading?.trim()) return subtext()
    return props.heading.trim()
  })

  const detail = createMemo(() => {
    if (!props.heading?.trim()) return undefined
    return subtext()
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
            <TextShimmer text={scene()} active />
          </div>
          <div data-slot="theater-subtext">
            <span>{subtitle()}</span>
            <Show when={detail()}>{(text) => <span data-slot="theater-subhint">{text()}</span>}</Show>
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
