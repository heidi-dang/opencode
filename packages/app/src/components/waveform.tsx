import { createEffect, onCleanup } from "solid-js"

export function Waveform({ url }: { url: string }) {
  let canvas: HTMLCanvasElement | undefined

  createEffect(() => {
    if (!canvas || !url) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Fetch and decode audio
    let running = true
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        return audioCtx.decodeAudioData(buf)
      })
      .then(audioBuf => {
        if (!running) return
        const data = audioBuf.getChannelData(0)
        const step = Math.floor(data.length / canvas.width)
        ctx.strokeStyle = "#38bdf8"
        ctx.beginPath()
        for (let i = 0; i < canvas.width; i++) {
          let min = 1, max = -1
          for (let j = 0; j < step; j++) {
            const v = data[i * step + j]
            if (v < min) min = v
            if (v > max) max = v
          }
          const y1 = ((1 - min) / 2) * canvas.height
          const y2 = ((1 - max) / 2) * canvas.height
          ctx.moveTo(i, y1)
          ctx.lineTo(i, y2)
        }
        ctx.stroke()
      })
    onCleanup(() => {
      running = false
    })
  })

  return <canvas ref={canvas} width={240} height={48} style={{ width: "100%", height: "48px", background: "#0b0f17", 'border-radius': "8px" }} />
}
