import path from "node:path"
import { mkdir } from "node:fs/promises"
import { decode_wav, encode_wav } from "./wav"

export async function layer_audio(files: string[], out_file: string, gains?: number[], peak_dbfs = -1) {
  const tracks = await Promise.all(files.map((file) => decode_wav(file)))
  const len = Math.max(...tracks.map((track) => track.left.length))
  const out = {
    sample_rate: tracks[0]?.sample_rate ?? 48000,
    channels: 2,
    left: new Float32Array(len),
    right: new Float32Array(len),
  }

  tracks.forEach((track, idx) => {
    const gain = gains?.[idx] ?? 1
    for (let i = 0; i < track.left.length; i++) {
      out.left[i] += track.left[i] * gain
      out.right[i] += track.right[i] * gain
    }
  })

  let peak = 0
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out.left[i]), Math.abs(out.right[i]))
  const target = Math.pow(10, peak_dbfs / 20)
  const norm = peak ? target / peak : 1
  for (let i = 0; i < len; i++) {
    out.left[i] *= norm
    out.right[i] *= norm
  }

  await mkdir(path.dirname(out_file), { recursive: true })
  await Bun.write(out_file, encode_wav(out))
  return out_file
}
