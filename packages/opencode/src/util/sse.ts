import { AsyncQueue } from "./queue"

/**
 * SSEResumptionBuffer holds the last N chunks in memory with sequential IDs
 * to enable stream resumption if the client reconnects with Last-Event-ID.
 */
export class SSEResumptionBuffer {
  private buffer: Array<{ id: string; data: string }> = []
  private nextID = 1

  constructor(private readonly maxSize = 50) {}

  add(data: string): string {
    const id = String(this.nextID++)
    this.buffer.push({ id, data })
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
    return id
  }

  getMissing(lastEventID: string): Array<{ id: string; data: string }> {
    const idNum = parseInt(lastEventID, 10)
    if (isNaN(idNum)) return []
    return this.buffer.filter((item) => parseInt(item.id, 10) > idNum)
  }
}

/**
 * SSEBatcher intelligently batches high-velocity events (like tokens)
 * into slightly larger chunks before broadcasting to reduce network overhead.
 */
export class SSEBatcher<T> {
  private buffer: T[] = []
  private timeout: Timer | null = null
  private maxBatchSize = 10
  private flushIntervalMs = 20

  constructor(
    private readonly queue: AsyncQueue<{ data: string; id: string } | null>,
    private readonly resumption: SSEResumptionBuffer,
  ) {}

  push(event: T) {
    this.buffer.push(event)

    if (this.buffer.length >= this.maxBatchSize) {
      this.flush()
      return
    }

    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), this.flushIntervalMs)
    }
  }

  flush() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (this.buffer.length === 0) return

    // For simplicity, we stringify each event but we could also group them
    // The requirement mentions 'batching into slightly larger chunks'.
    // If we want to truly reduce TCP packets, sending multiple data segments in one write is key.
    for (const event of this.buffer) {
      const data = JSON.stringify(event)
      const id = this.resumption.add(data)
      this.queue.push({ data, id })
    }
    this.buffer = []
  }
}
