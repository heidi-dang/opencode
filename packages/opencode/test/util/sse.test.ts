import { expect, test, describe, spyOn } from "bun:test"
import { SSEBatcher, SSEResumptionBuffer } from "../../src/util/sse"
import { AsyncQueue } from "../../src/util/queue"

describe("SSEResumptionBuffer", () => {
  test("should add events and generate sequential IDs", () => {
    const buffer = new SSEResumptionBuffer(3)
    const id1 = buffer.add("event 1")
    const id2 = buffer.add("event 2")
    const id3 = buffer.add("event 3")
    
    expect(id1).toBe("1")
    expect(id2).toBe("2")
    expect(id3).toBe("3")
    
    const id4 = buffer.add("event 4")
    expect(id4).toBe("4")
    
    // Should have rolled over (size 3)
    const missing = buffer.getMissing("1")
    expect(missing).toHaveLength(3) // 2, 3, 4
    expect(missing[0].id).toBe("2")
    expect(missing[2].id).toBe("4")
  })

  test("should return missing events since last ID", () => {
    const buffer = new SSEResumptionBuffer(10)
    for (let i = 1; i <= 5; i++) buffer.add(`event ${i}`)
    
    const missing = buffer.getMissing("2")
    expect(missing).toHaveLength(3)
    expect(missing[0].id).toBe("3")
    expect(missing[2].id).toBe("5")
  })
})

describe("SSEBatcher", () => {
  test("should debounce events", async () => {
    const q = new AsyncQueue<{ data: string; id: string } | null>()
    const resumption = new SSEResumptionBuffer(10)
    const batcher = new SSEBatcher(q, resumption)
    
    batcher.push({ type: "test", value: 1 })
    batcher.push({ type: "test", value: 2 })
    
    // Should not have pushed yet (waiting for timeout or max size)
    // Actually, AsyncQueue is pull-based, so it will wait.
    
    await new Promise(r => setTimeout(r, 50))
    batcher.flush()
    
    const item1 = await q.next()
    const item2 = await q.next()
    
    expect(JSON.parse(item1!.data)).toEqual({ type: "test", value: 1 })
    expect(item1!.id).toBe("1")
    expect(JSON.parse(item2!.data)).toEqual({ type: "test", value: 2 })
    expect(item2!.id).toBe("2")
  })

  test("should flush immediately when max batch size reached", async () => {
    const q = new AsyncQueue<{ data: string; id: string } | null>()
    const resumption = new SSEResumptionBuffer(100)
    const batcher = new SSEBatcher(q, resumption)
    
    // Default maxBatchSize is 10
    for (let i = 0; i < 10; i++) {
        batcher.push({ i })
    }
    
    // Should have flushed immediately
    const item = await q.next()
    expect(item).toBeDefined()
    expect(JSON.parse(item!.data)).toEqual({ i: 0 })
  })
})
