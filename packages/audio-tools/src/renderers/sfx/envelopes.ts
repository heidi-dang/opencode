export function adsr(t: number, len: number, a: number, d: number, s: number, r: number) {
  if (t <= a) return t / Math.max(a, 1e-6)
  if (t <= a + d) {
    const n = (t - a) / Math.max(d, 1e-6)
    return 1 - (1 - s) * n
  }
  if (t <= len - r) return s
  const n = (t - (len - r)) / Math.max(r, 1e-6)
  return s * (1 - Math.min(1, n))
}

export function exp_decay(t: number, speed: number) {
  return Math.exp(-t * speed)
}

export function pulse(t: number, center: number, width: number) {
  const n = Math.abs(t - center) / Math.max(width, 1e-6)
  return Math.max(0, 1 - n)
}
