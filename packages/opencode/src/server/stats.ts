import { Pty } from "@/pty"

type Kind = "event" | "global" | "workspace"

const sse = {
  event: 0,
  global: 0,
  workspace: 0,
}

export namespace ServerStats {
  export function open(kind: Kind) {
    sse[kind] += 1
    let done = false
    return () => {
      if (done) return
      done = true
      sse[kind] = Math.max(0, sse[kind] - 1)
    }
  }

  export function snapshot() {
    const pty = Pty.stats()
    return {
      sse: {
        ...sse,
        total: sse.event + sse.global + sse.workspace,
      },
      pty,
    }
  }
}
