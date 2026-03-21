import { createSignal } from "solid-js"

export function Slider(props: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  const [val, setVal] = createSignal(props.value)
  return (
    <div class="flex flex-col gap-1">
      <label class="text-12-medium text-white/60">{props.label}: <span class="text-white/80">{val()}</span></label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.01}
        value={val()}
        onInput={e => {
          const v = parseFloat(e.currentTarget.value)
          setVal(v)
          props.onChange(v)
        }}
        class="w-full accent-sky-400"
      />
    </div>
  )
}
