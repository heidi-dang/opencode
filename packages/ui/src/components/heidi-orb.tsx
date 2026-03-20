import { createEffect, createSignal } from "solid-js"
import type { Phase } from "../lib/thinking-wording"
import "./heidi-orb.css"

export function HeidiOrb(props: { phase: Phase }) {
  const [prev, setPrev] = createSignal<Phase>("idle")
  const [relief, setRelief] = createSignal("soft")

  const face = () => {
    if (props.phase === "focused") return "focused"
    if (props.phase === "warning") return "warn"
    if (props.phase === "verifying") return "focused"
    if (props.phase === "success") return "smile"
    if (props.phase === "blocked") return "warn"
    if (props.phase === "testing") return "focused"
    if (props.phase === "idle") return "calm"
    return "calm"
  }

  // Emotional mode mapping:
  // normal flows keep Heidi cute, hard states tighten into a serious posture.
  const mood = () => {
    if (props.phase === "warning") return "hardest"
    if (props.phase === "blocked") return "hardest"
    if (props.phase === "focused") return "hard"
    if (props.phase === "verifying") return "hard"
    if (props.phase === "testing") return "hard"
    return "cute"
  }

  // State-to-state continuity:
  // success relief intensity depends on the state immediately before success.
  createEffect(() => {
    const next = props.phase
    const from = prev()
    if (next === "success") {
      if (from === "warning" || from === "blocked") {
        setRelief("deep")
      } else if (from === "focused" || from === "verifying" || from === "testing") {
        setRelief("mid")
      } else {
        setRelief("soft")
      }
    }
    setPrev(next)
  })

  return (
    <div
      data-component="heidi-orb"
      data-phase={props.phase}
      data-mood={mood()}
      data-relief={props.phase === "success" ? relief() : "none"}
    >
      <div data-slot="orb-plate" />
      <div data-slot="orb-aura" />
      <div data-slot="orb-core" />
      <div data-slot="orb-halo" />
      <div data-slot="orb-ring" />
      <div data-slot="orb-face" data-face={face()}>
        <span data-slot="orb-eye" data-eye="left" />
        <span data-slot="orb-eye" data-eye="right" />
        <span data-slot="orb-mouth" />
        <span data-slot="orb-cheek" data-cheek="left" />
        <span data-slot="orb-cheek" data-cheek="right" />
      </div>
      <div data-slot="orb-shine" />
    </div>
  )
}
