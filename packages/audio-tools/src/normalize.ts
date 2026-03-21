import path from "node:path"
import { mkdir } from "node:fs/promises"
import { decode_wav, encode_wav } from "./wav"

export async function normalize_audio(file: string, peak_dbfs = -1, out_file?: string) {
  const pcm = await decode_wav(file)
  let peak = 0
  for (let i = 0; i < pcm.left.length; i++) peak = Math.max(peak, Math.abs(pcm.left[i]), Math.abs(pcm.right[i]))
  const target = Math.pow(10, peak_dbfs / 20)
  const gain = peak ? target / peak : 1
  for (let i = 0; i < pcm.left.length; i++) {
    pcm.left[i] *= gain
    pcm.right[i] *= gain
  }
  const next = out_file ?? file.replace(/\.[^.]+$/, ".normalized.wav")
  await mkdir(path.dirname(next), { recursive: true })
  await Bun.write(next, encode_wav(pcm))
  return next
}
