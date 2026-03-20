import { GlobalBus } from "@/bus/global"
import { disposeInstance } from "@/effect/instance-registry"
import { Flag } from "@/flag/flag"
import { Filesystem } from "@/util/filesystem"
import { iife } from "@/util/iife"
import { Log } from "@/util/log"
import { Context } from "../util/context"
import { Project } from "./project"
import { State } from "./state"

interface Context {
  directory: string
  worktree: string
  project: Project.Info
}
const context = Context.create<Context>("instance")
const cache = new Map<string, Entry>()

const DEFAULT_TTL = 15 * 60 * 1000

interface Entry {
  ctx: Promise<Context>
  refs: number
  timer?: ReturnType<typeof setTimeout>
  disposing?: Promise<void>
}

const disposal = {
  all: undefined as Promise<void> | undefined,
}

function emit(directory: string) {
  GlobalBus.emit("event", {
    directory,
    payload: {
      type: "server.instance.disposed",
      properties: {
        directory,
      },
    },
  })
}

function boot(input: { directory: string; init?: () => Promise<any>; project?: Project.Info; worktree?: string }) {
  return iife(async () => {
    const ctx =
      input.project && input.worktree
        ? {
            directory: input.directory,
            worktree: input.worktree,
            project: input.project,
          }
        : await Project.fromDirectory(input.directory).then(({ project, sandbox }) => ({
            directory: input.directory,
            worktree: sandbox,
            project,
          }))
    await context.provide(ctx, async () => {
      await input.init?.()
    })
    return ctx
  })
}

function track(directory: string, next: Promise<Context>) {
  const entry: Entry = {
    ctx: Promise.resolve(undefined as never),
    refs: 0,
  }
  const task = next.catch((error) => {
    if (cache.get(directory) === entry) cache.delete(directory)
    throw error
  })
  entry.ctx = task
  cache.set(directory, entry)
  return entry
}

function clear(entry: Entry) {
  if (!entry.timer) return
  clearTimeout(entry.timer)
  entry.timer = undefined
}

function ttl() {
  return Flag.OPENCODE_INSTANCE_TTL_MS ?? DEFAULT_TTL
}

async function dispose(directory: string, entry?: Entry) {
  const hit = entry ?? cache.get(directory)
  if (!hit) return
  if (hit.disposing) return hit.disposing
  clear(hit)
  const task = iife(async () => {
    if (cache.get(directory) === hit) cache.delete(directory)
    const ctx = await hit.ctx.catch((error) => {
      Log.Default.warn("instance dispose failed", { key: directory, error })
      return undefined
    })
    if (!ctx) return
    await context.provide(ctx, async () => {
      await Promise.all([State.dispose(directory), disposeInstance(directory)])
    })
    emit(directory)
  }).finally(() => {
    if (hit.disposing === task) hit.disposing = undefined
  })
  hit.disposing = task
  return task
}

function schedule(directory: string, entry: Entry) {
  if (entry.refs > 0) return
  clear(entry)
  entry.timer = setTimeout(() => {
    if (cache.get(directory) !== entry) return
    if (entry.refs > 0) return
    void dispose(directory, entry)
  }, ttl())
  entry.timer.unref?.()
}

export const Instance = {
  async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    const directory = Filesystem.resolve(input.directory)
    const existing =
      cache.get(directory) ??
      (() => {
        Log.Default.info("creating instance", { directory })
        return track(
          directory,
          boot({
            directory,
            init: input.init,
          }),
        )
      })()
    clear(existing)
    existing.refs += 1
    try {
      const ctx = await existing.ctx
      return await context.provide(ctx, async () => {
        return input.fn()
      })
    } finally {
      existing.refs -= 1
      if (cache.get(directory) === existing) schedule(directory, existing)
    }
  },
  get current() {
    return context.use()
  },
  get directory() {
    return context.use().directory
  },
  get worktree() {
    return context.use().worktree
  },
  get project() {
    return context.use().project
  },
  /**
   * Check if a path is within the project boundary.
   * Returns true if path is inside Instance.directory OR Instance.worktree.
   * Paths within the worktree but outside the working directory should not trigger external_directory permission.
   */
  containsPath(filepath: string) {
    if (Filesystem.contains(Instance.directory, filepath)) return true
    // Non-git projects set worktree to "/" which would match ANY absolute path.
    // Skip worktree check in this case to preserve external_directory permissions.
    if (Instance.worktree === "/") return false
    return Filesystem.contains(Instance.worktree, filepath)
  },
  /**
   * Captures the current instance ALS context and returns a wrapper that
   * restores it when called. Use this for callbacks that fire outside the
   * instance async context (native addons, event emitters, timers, etc.).
   */
  bind<F extends (...args: any[]) => any>(fn: F): F {
    const ctx = context.use()
    return ((...args: any[]) => context.provide(ctx, () => fn(...args))) as F
  },
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.create(() => Instance.directory, init, dispose)
  },
  async reload(input: { directory: string; init?: () => Promise<any>; project?: Project.Info; worktree?: string }) {
    const directory = Filesystem.resolve(input.directory)
    Log.Default.info("reloading instance", { directory })
    await dispose(directory)
    return await track(directory, boot({ ...input, directory })).ctx
  },
  async dispose() {
    const directory = Instance.directory
    Log.Default.info("disposing instance", { directory })
    await dispose(directory)
  },
  async disposeAll() {
    if (disposal.all) return disposal.all

    disposal.all = iife(async () => {
      Log.Default.info("disposing all instances")
      const entries = [...cache.entries()]
      for (const [key, value] of entries) {
        if (cache.get(key) !== value) continue
        await dispose(key, value)
      }
    }).finally(() => {
      disposal.all = undefined
    })

    return disposal.all
  },
}
