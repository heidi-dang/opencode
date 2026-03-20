import type { Phase } from "../lib/thinking-wording"

export function HeidiOrb(props: { phase: Phase }) {
  return (
    <div data-component="heidi-orb" data-phase={props.phase}>
      <div data-slot="orb-core" />
      <div data-slot="orb-halo" />
      <div data-slot="orb-ring" />
    </div>
  )
}
