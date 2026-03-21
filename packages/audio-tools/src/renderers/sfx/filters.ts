export function lowpass(data: Float32Array, alpha: number) {
  const out = new Float32Array(data.length)
  let prev = 0
  for (let i = 0; i < data.length; i++) {
    prev += alpha * (data[i] - prev)
    out[i] = prev
  }
  return out
}

export function highpass(data: Float32Array, alpha: number) {
  const out = new Float32Array(data.length)
  let prev_in = 0
  let prev_out = 0
  for (let i = 0; i < data.length; i++) {
    const next = alpha * (prev_out + data[i] - prev_in)
    out[i] = next
    prev_in = data[i]
    prev_out = next
  }
  return out
}

export function tilt(data: Float32Array, amount: number) {
  const lo = lowpass(data, 0.04 + amount * 0.06)
  const hi = highpass(data, 0.82 - amount * 0.2)
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = lo[i] * (1 - amount * 0.2) + hi[i] * amount
  return out
}
