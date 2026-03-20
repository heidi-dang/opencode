import { createSignal, createEffect, onCleanup, For, Show } from "solid-js"
import { TextShimmer } from "./text-shimmer"
import { scenes, SUBTEXTS, THOUGHT_CHIPS, type Phase } from "../lib/thinking-wording"
import { HeidiOrb } from "./heidi-orb"

export function ThinkingTheater(props: {
  phase: Phase
  heading?: string | null
}) {
  // Scene rotation — every 5s
  const [idx, setIdx] = createSignal(0)
  const [sub, setSub] = createSignal(0)
  const [chips, setChips] = createSignal<string[]>([])

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
        const next = [...prev, pick].slice(-3)
        return next
      })
    }, 2800)
    onCleanup(() => clearInterval(timer))
  })

  // Fade out old chips
  createEffect(() => {
    const timer = setInterval(() => {
      setChips((prev) => prev.slice(1))
    }, 4200)
    onCleanup(() => clearInterval(timer))
  })

  const scene = () => {
    const list = scenes(props.phase)
    return list[idx() % list.length]
  }

  const subtext = () => SUBTEXTS[sub() % SUBTEXTS.length]

  return (
    <div data-component="thinking-theater" data-phase={props.phase}>
      <div data-slot="theater-backdrop" />
      <div data-slot="theater-content">
        <div data-slot="theater-orb">
          <HeidiOrb phase={props.phase} />
        </div>
        <div data-slot="theater-text">
          <div data-slot="theater-scene">
            <TextShimmer text={scene()} active />
          </div>
          <div data-slot="theater-subtext">
            <span>{subtext()}</span>
          </div>
          <Show when={props.heading}>
            <div data-slot="theater-heading">
              {props.heading}
            </div>
          </Show>
        </div>
        <div data-slot="theater-chips">
          <For each={chips()}>
            {(chip) => (
              <span data-slot="theater-chip">{chip}</span>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
