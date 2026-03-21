export function loop_frames(sample_rate: number, bpm = 96, bars = 8) {
  const beats = bars * 4
  const seconds = (beats * 60) / bpm
  return Math.round(seconds * sample_rate)
}
