import path from "node:path"
import { decode_wav } from "./wav"
import type { AudioMetrics } from "./types"

function db(v: number) {
  return 20 * Math.log10(Math.max(v, 1e-6))
}

function fft_centroid(samples: Float32Array, sample_rate: number) {
  const size = Math.min(2048, samples.length)
  let top = 0
  let bottom = 0
  for (let k = 1; k < size / 2; k++) {
    let re = 0
    let im = 0
    for (let n = 0; n < size; n++) {
      const angle = (2 * Math.PI * k * n) / size
      re += samples[n] * Math.cos(angle)
      im -= samples[n] * Math.sin(angle)
    }
    const mag = Math.sqrt(re * re + im * im)
    const freq = (k * sample_rate) / size
    top += freq * mag
    bottom += mag
  }
  return bottom ? top / bottom : 0
}

function waveform(samples: Float32Array, bars = 36) {
  const out = [] as number[]
  const size = Math.max(1, Math.floor(samples.length / bars))
  for (let i = 0; i < bars; i++) {
    let sum = 0
    const start = i * size
    const end = Math.min(samples.length, start + size)
    for (let j = start; j < end; j++) sum += Math.abs(samples[j])
    out.push(Number((sum / Math.max(1, end - start)).toFixed(4)))
  }
  return out
}

export async function analyze_audio(file: string): Promise<AudioMetrics> {
  const pcm = await decode_wav(file)
  const len = pcm.left.length
  let peak = 0
  let sum = 0
  let diff = 0
  let clip = false
  const mono = new Float32Array(len)

  for (let i = 0; i < len; i++) {
    const sample = (pcm.left[i] + pcm.right[i]) * 0.5
    mono[i] = sample
    peak = Math.max(peak, Math.abs(sample))
    sum += sample * sample
    if (i > 0) diff = Math.max(diff, Math.abs(sample - mono[i - 1]))
    if (Math.abs(sample) >= 0.999) clip = true
  }

  let tail = 0
  const floor = Math.max(peak * 0.04, 0.002)
  for (let i = len - 1; i >= 0; i--) {
    if (Math.abs(mono[i]) > floor) {
      tail = Math.round(((len - i) / pcm.sample_rate) * 1000)
      break
    }
  }

  const seam = Math.min(2048, Math.floor(len / 8))
  let seam_diff = 0
  for (let i = 0; i < seam; i++) seam_diff += Math.abs(mono[i] - mono[len - seam + i])

  const rms = Math.sqrt(sum / Math.max(1, len))
  const centroid = fft_centroid(mono, pcm.sample_rate)
  const harshness = Math.max(0, Math.min(1, centroid / 7000))
  const muddiness = Math.max(0, Math.min(1, (420 - centroid) / 420))

  return {
    duration_ms: Math.round((len / pcm.sample_rate) * 1000),
    sample_rate: pcm.sample_rate,
    channels: 2,
    peak: Number(peak.toFixed(4)),
    rms: Number(rms.toFixed(4)),
    loudness: Number(db(rms).toFixed(2)),
    spectral_centroid: Number(centroid.toFixed(2)),
    tail_ms: tail,
    transient_sharpness: Number(diff.toFixed(4)),
    clipping_detected: clip,
    loop_seam_quality: Number(Math.max(0, 1 - seam_diff / Math.max(1, seam)).toFixed(4)),
    harshness: Number(harshness.toFixed(4)),
    muddiness: Number(muddiness.toFixed(4)),
    waveform: waveform(mono),
  }
}

export function sidecar_file(file: string) {
  return file.replace(/\.[^.]+$/, ".json")
}

export function basename_no_ext(file: string) {
  return path.basename(file).replace(/\.[^.]+$/, "")
}
