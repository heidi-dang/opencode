import { adsr, exp_decay, pulse } from "./envelopes"
import { lowpass, tilt } from "./filters"

export type Stereo = {
  left: Float32Array
  right: Float32Array
  sample_rate: number
}

export type RenderCtx = {
  frames: number
  sample_rate: number
  intensity: number
  brightness: number
  width: number
  seed: number
}

function rand(seed: number) {
  let x = seed >>> 0
  return () => {
    x += 0x6d2b79f5
    let t = Math.imul(x ^ (x >>> 15), 1 | x)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function blank(ctx: RenderCtx) {
  return {
    left: new Float32Array(ctx.frames),
    right: new Float32Array(ctx.frames),
    sample_rate: ctx.sample_rate,
  }
}

function paint(ctx: RenderCtx, fn: (t: number, n: number, noise: () => number) => [number, number]) {
  const out = blank(ctx)
  const noise = rand(ctx.seed)
  for (let i = 0; i < ctx.frames; i++) {
    const t = i / ctx.sample_rate
    const n = i / Math.max(1, ctx.frames - 1)
    const [l, r] = fn(t, n, noise)
    out.left[i] = l
    out.right[i] = r
  }
  return out
}

function shimmer(ctx: RenderCtx, freq: number, gain: number) {
  return paint(ctx, (t, n) => {
    const env = exp_decay(n, 7)
    const wobble = 1 + Math.sin(t * 14) * 0.004
    const sig = Math.sin(2 * Math.PI * freq * wobble * t) * env * gain
    return [sig * (1 - ctx.width * 0.2), sig * (1 + ctx.width * 0.2)]
  })
}

export function chirp_up(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const f = 420 + 820 * n * (0.75 + ctx.brightness * 0.5)
    const env = adsr(n, 1, 0.03, 0.18, 0.25, 0.32)
    const sig = Math.sin(2 * Math.PI * f * t) * env * 0.46 * (0.8 + ctx.intensity * 0.5)
    return [sig * (1 - ctx.width), sig * (1 + ctx.width)]
  })
}

export function chirp_down(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const f = 980 - 700 * n
    const env = adsr(n, 1, 0.02, 0.12, 0.22, 0.42)
    const sig = Math.sin(2 * Math.PI * f * t) * env * 0.4
    return [sig * (1 + ctx.width * 0.3), sig * (1 - ctx.width * 0.3)]
  })
}

export function glass_dual(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const env = exp_decay(n, 6)
    const a = Math.sin(2 * Math.PI * (780 + ctx.brightness * 320) * t)
    const b = Math.sin(2 * Math.PI * (1180 + ctx.brightness * 440) * t)
    const sig = (a * 0.6 + b * 0.35) * env * 0.36
    return [sig * (1 - ctx.width * 0.6), sig * (1 + ctx.width * 0.6)]
  })
}

export function metal_click(ctx: RenderCtx) {
  // Less harsh: reduce grit, soften attack, add lowpass
  const out = paint(ctx, (t, n, noise) => {
    const env = pulse(n, 0.025, 0.04) + pulse(n, 0.09, 0.03) * 0.38
    const carrier = Math.sin(2 * Math.PI * 2100 * t) * 0.36
    const grit = (noise() * 2 - 1) * 0.45 // less noise
    const sig = (carrier + grit) * env * 0.22
    return [sig, sig * (1 - ctx.width * 0.2)]
  })
  out.left = lowpass(out.left, 0.12)
  out.right = lowpass(out.right, 0.12)
  return out
}

export function triplet_glitch(ctx: RenderCtx) {
  // Less harsh: reduce noise, soften gate, add lowpass
  const out = paint(ctx, (t, n, noise) => {
    const gate = pulse(n, 0.13, 0.05) + pulse(n, 0.27, 0.05) + pulse(n, 0.41, 0.06)
    const tone = Math.sin(2 * Math.PI * (520 + Math.sin(t * 23) * 160) * t)
    const sig = (tone * 0.62 + (noise() * 2 - 1) * 0.18) * gate * 0.38
    return [sig * (1 + ctx.width * 0.4), sig * (1 - ctx.width * 0.4)]
  })
  out.left = lowpass(out.left, 0.10)
  out.right = lowpass(out.right, 0.10)
  return out
}

export function soft_pulse(ctx: RenderCtx) {
  const out = paint(ctx, (t, n) => {
    const gate = pulse(n, 0.14, 0.08)
    const sig = Math.sin(2 * Math.PI * 180 * t) * gate * 0.22
    return [sig, sig]
  })
  out.left = lowpass(out.left, 0.09)
  out.right = lowpass(out.right, 0.09)
  return out
}

export function hybrid_bell(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const env = exp_decay(n, 5.4)
    const base = Math.sin(2 * Math.PI * 930 * t)
    const upper = Math.sin(2 * Math.PI * 1860 * t) * 0.42
    const sig = (base + upper) * env * 0.42
    return [sig * (1 - ctx.width * 0.25), sig * (1 + ctx.width * 0.25)]
  })
}

export function prestige_rise(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const env = adsr(n, 1, 0.04, 0.2, 0.68, 0.2)
    const f = 420 + 520 * Math.pow(n, 0.7)
    const sig = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.28) * env * 0.44
    return [sig * (1 - ctx.width * 0.4), sig * (1 + ctx.width * 0.4)]
  })
}

export function micro_impact(ctx: RenderCtx) {
  // Less harsh: reduce crack, soften decay, add lowpass
  const out = paint(ctx, (t, n, noise) => {
    const env = exp_decay(n, 22)
    const low = Math.sin(2 * Math.PI * 110 * t) * 0.62
    const crack = (noise() * 2 - 1) * 0.38
    const sig = (low + crack * 0.38) * env * 0.39 * (0.8 + ctx.intensity * 0.4)
    return [sig, sig]
  })
  out.left = lowpass(out.left, 0.13)
  out.right = lowpass(out.right, 0.13)
  return out
}

export function glass_chord(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const env = exp_decay(n, 4.6)
    const a = Math.sin(2 * Math.PI * 760 * t)
    const b = Math.sin(2 * Math.PI * 960 * t) * 0.48
    const c = Math.sin(2 * Math.PI * 1240 * t) * 0.34
    const sig = (a + b + c) * env * 0.34
    return [sig * (1 - ctx.width * 0.6), sig * (1 + ctx.width * 0.6)]
  })
}

export function low_bloom(ctx: RenderCtx) {
  const out = paint(ctx, (t, n) => {
    const env = exp_decay(n, 3.8)
    const sig = Math.sin(2 * Math.PI * 96 * t) * env * 0.38
    return [sig, sig]
  })
  out.left = lowpass(out.left, 0.03)
  out.right = lowpass(out.right, 0.03)
  return out
}

export function shimmer_tail(ctx: RenderCtx) {
  return shimmer(ctx, 2200 + ctx.brightness * 900, 0.22)
}

export function low_support(ctx: RenderCtx) {
  const out = paint(ctx, (t, n) => {
    const env = exp_decay(n, 5)
    const sig = Math.sin(2 * Math.PI * 170 * t) * env * 0.18
    return [sig, sig]
  })
  out.left = lowpass(out.left, 0.04)
  out.right = lowpass(out.right, 0.04)
  return out
}

export function air_shimmer(ctx: RenderCtx) {
  const out = shimmer(ctx, 4200 + ctx.brightness * 1200, 0.18)
  out.left = tilt(out.left, 0.72)
  out.right = tilt(out.right, 0.72)
  return out
}

export function subtle_body(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const env = adsr(n, 1, 0.06, 0.12, 0.5, 0.24)
    const sig = Math.sin(2 * Math.PI * 360 * t) * env * 0.18
    return [sig, sig]
  })
}

export function drone_bed(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const wobble = 1 + Math.sin(t * 0.7) * 0.01
    const sig = (Math.sin(2 * Math.PI * 82 * wobble * t) + Math.sin(2 * Math.PI * 123 * wobble * t) * 0.4) * 0.22
    const fade = Math.min(1, n * 4) * Math.min(1, (1 - n) * 4)
    return [sig * fade, sig * fade]
  })
}

export function scan_blips(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const gate = pulse(n, 0.18, 0.03) + pulse(n, 0.52, 0.04) + pulse(n, 0.84, 0.03)
    const sig = Math.sin(2 * Math.PI * (960 + Math.sin(t * 8) * 120) * t) * gate * 0.18
    return [sig * (1 - ctx.width * 0.3), sig * (1 + ctx.width * 0.3)]
  })
}

export function pulse_loop(ctx: RenderCtx) {
  return paint(ctx, (t, n) => {
    const phase = (n * 8) % 1
    const gate = pulse(phase, 0.12, 0.18)
    const sig = Math.sin(2 * Math.PI * 146 * t) * gate * 0.16
    return [sig, sig]
  })
}
