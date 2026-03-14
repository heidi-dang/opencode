// React-free implementation without pierre/diffs
// Worker pool support is not available in the basic shiki API
// This is a minimal stub for compatibility

export type WorkerPoolStyle = "unified" | "split"

export function workerFactory(): Worker {
  // ShikiWorkerUrl is not available, returning a dummy worker
  return new Worker("about:blank", { type: "module" })
}

export function getWorkerPool(style: WorkerPoolStyle | undefined): undefined {
  // Worker pools not available in this implementation
  return undefined
}

export function getWorkerPools() {
  return {
    unified: undefined,
    split: undefined,
  }
}
