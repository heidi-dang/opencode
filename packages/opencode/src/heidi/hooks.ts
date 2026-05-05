import { Effect, Layer, ServiceMap } from "effect"
import { Bus } from "@/bus"
import { Log } from "@/util/log"
import { HeidiIndexer } from "./indexer"
import { Vcs } from "@/project/vcs"

const log = Log.create({ service: "heidi.hooks" })

export namespace HeidiHooks {
  export class Service extends ServiceMap.Service<Service, {
    readonly reindex: () => Effect.Effect<void>
  }>()("@opencode/HeidiHooks") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      yield* Effect.sync(() => {
        // Subscribe to VCS branch changes
        Bus.subscribe(Vcs.Event.BranchUpdated, () => {
          log.info("Branch changed, reindexing...")
          HeidiIndexer.indexRepository().catch((err) => {
            log.error("Failed to reindex on branch change", { error: err })
          })
        })

        // Subscribe to file changes for logging
        // TODO: implement incremental indexing on file change
        log.info("HeidiHooks initialized")
      })

      return Service.of({
        reindex: Effect.fn("HeidiHooks.reindex")(function* () {
          yield* Effect.promise(() => HeidiIndexer.indexRepository())
        }),
      })
    }),
  ).pipe(Layer.fresh)
}
