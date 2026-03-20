import { afterEach, expect, test } from "bun:test"

import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

test("Instance.state caches values for the same instance", async () => {
  await using tmp = await tmpdir()
  let n = 0
  const state = Instance.state(() => ({ n: ++n }))

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const a = state()
      const b = state()
      expect(a).toBe(b)
      expect(n).toBe(1)
    },
  })
})

test("Instance.state isolates values by directory", async () => {
  await using a = await tmpdir()
  await using b = await tmpdir()
  let n = 0
  const state = Instance.state(() => ({ n: ++n }))

  const x = await Instance.provide({
    directory: a.path,
    fn: async () => state(),
  })
  const y = await Instance.provide({
    directory: b.path,
    fn: async () => state(),
  })
  const z = await Instance.provide({
    directory: a.path,
    fn: async () => state(),
  })

  expect(x).toBe(z)
  expect(x).not.toBe(y)
  expect(n).toBe(2)
})

test("Instance.state is disposed on instance reload", async () => {
  await using tmp = await tmpdir()
  const seen: string[] = []
  let n = 0
  const state = Instance.state(
    () => ({ n: ++n }),
    async (value) => {
      seen.push(String(value.n))
    },
  )

  const a = await Instance.provide({
    directory: tmp.path,
    fn: async () => state(),
  })
  await Instance.reload({ directory: tmp.path })
  const b = await Instance.provide({
    directory: tmp.path,
    fn: async () => state(),
  })

  expect(a).not.toBe(b)
  expect(seen).toEqual(["1"])
})

test("Instance.state is disposed on disposeAll", async () => {
  await using a = await tmpdir()
  await using b = await tmpdir()
  const seen: string[] = []
  const state = Instance.state(
    () => ({ dir: Instance.directory }),
    async (value) => {
      seen.push(value.dir)
    },
  )

  await Instance.provide({
    directory: a.path,
    fn: async () => state(),
  })
  await Instance.provide({
    directory: b.path,
    fn: async () => state(),
  })
  await Instance.disposeAll()

  expect(seen.sort()).toEqual([a.path, b.path].sort())
})

test("Instance.state dedupes concurrent promise initialization", async () => {
  await using tmp = await tmpdir()
  let n = 0
  const state = Instance.state(async () => {
    n += 1
    await Bun.sleep(10)
    return { n }
  })

  const [a, b] = await Instance.provide({
    directory: tmp.path,
    fn: async () => Promise.all([state(), state()]),
  })

  expect(a).toBe(b)
  expect(n).toBe(1)
})

test("Instance auto-disposes after idle ttl", async () => {
  await using tmp = await tmpdir()
  const prev = process.env.OPENCODE_INSTANCE_TTL_MS
  const seen: string[] = []
  const state = Instance.state(
    () => ({ dir: Instance.directory }),
    async (value) => {
      seen.push(value.dir)
    },
  )

  process.env.OPENCODE_INSTANCE_TTL_MS = "20"

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => state(),
    })

    for (let i = 0; i < 20; i++) {
      if (seen.length) break
      await Bun.sleep(10)
    }

    expect(seen).toEqual([tmp.path])
  } finally {
    if (prev === undefined) delete process.env.OPENCODE_INSTANCE_TTL_MS
    else process.env.OPENCODE_INSTANCE_TTL_MS = prev
    await Instance.disposeAll()
  }
})
