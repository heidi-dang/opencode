import { readFile } from "node:fs/promises"

export type PCM = {
  sample_rate: number
  channels: number
  left: Float32Array
  right: Float32Array
}

function clamp(v: number) {
  return Math.max(-1, Math.min(1, v))
}

export function encode_wav(data: PCM) {
  const frames = data.left.length
  const channels = data.channels
  const block = channels * 2
  const bytes = frames * block
  const out = new Uint8Array(44 + bytes)
  const view = new DataView(out.buffer)
  const write = (off: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[off + i] = text.charCodeAt(i)
  }

  write(0, "RIFF")
  view.setUint32(4, 36 + bytes, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, data.sample_rate, true)
  view.setUint32(28, data.sample_rate * block, true)
  view.setUint16(32, block, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, bytes, true)

  let off = 44
  for (let i = 0; i < frames; i++) {
    view.setInt16(off, Math.round(clamp(data.left[i]) * 32767), true)
    off += 2
    view.setInt16(off, Math.round(clamp(data.right[i]) * 32767), true)
    off += 2
  }
  return out
}

export async function decode_wav(file: string): Promise<PCM> {
  const buf = await readFile(file)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const channels = view.getUint16(22, true)
  const sample_rate = view.getUint32(24, true)
  const bits = view.getUint16(34, true)
  if (bits !== 16) throw new Error(`Unsupported bit depth: ${bits}`)
  const size = view.getUint32(40, true)
  const frames = size / (channels * 2)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  let off = 44
  for (let i = 0; i < frames; i++) {
    left[i] = view.getInt16(off, true) / 32768
    off += 2
    right[i] = channels === 2 ? view.getInt16(off, true) / 32768 : left[i]
    off += channels === 2 ? 2 : 0
  }
  return { sample_rate, channels: 2, left, right }
}
