type Combo = {
  count: number
  time: number
}

export function combo(prev: Combo | undefined, time: number, window = 2500) {
  if (!prev) return { count: 1, time }
  if (time - prev.time > window) return { count: 1, time }
  return { count: prev.count + 1, time }
}