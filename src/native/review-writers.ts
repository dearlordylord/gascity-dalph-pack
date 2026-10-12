import { Effect } from "effect"
import { type BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import { stopNativeWriter } from "./session-stop.ts"
import { nativeSession } from "./session.ts"
import { nativeWriterNode, reviewSessionMatches } from "./review-correlation.ts"
import { nativeWriterInventory, NativeSessionBoundaryConcurrency } from "./session-inventory.ts"
import { historicalWritersStopped } from "./historical-writers.ts"
import { waitForNativeRetirement } from "./retirement.ts"

const observeReviewWritersStopped = Effect.fn("NativeReview.observeWritersStopped")(function* (
  config: RuntimeConfig,
  commands: Commands,
  rows: ReadonlyArray<Bead>,
  path: string,
  required: ReadonlyArray<BeadId>,
  tracker: ReturnType<typeof makeTracker>
) {
  const entries = yield* nativeWriterInventory(config, commands, required)
  const observed = yield* Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const session = yield* nativeSession(config, commands, entry.id)
        const node = nativeWriterNode(rows, session, ["work", "fix", "review"])
        if (!node) {
          if (yield* historicalWritersStopped(config, commands, tracker, rows, path, session)) {
            return session.id
          }
          if (session.metadata.work_dir === path)
            return yield* new BoundaryFailure({ message: "unrelated native writer shares the attempt workspace" })
          return null
        }
        if (!reviewSessionMatches(session, node, path))
          return yield* new BoundaryFailure({
            message: `native writer has contradictory session/worktree/template correlation: session ${session.id}, node ${node.id}, claim ${session.metadata.current_claim_bead_id}, workspace ${session.metadata.work_dir}, template ${session.metadata.template}; expected ${path}, ${node.metadata?.["gc.run_target"]}`
          })
        yield* stopNativeWriter(config, commands, tracker, session, node.id)
        return session.id
      }),
    { concurrency: NativeSessionBoundaryConcurrency }
  )
  const seen = new Set(observed)
  if (required.some((id) => !seen.has(id)))
    return yield* new BoundaryFailure({ message: "native review/fix writer inventory is incomplete" })
})
export const reviewWritersStopped = Effect.fn("NativeReview.writersStopped")(
  (...args: Parameters<typeof observeReviewWritersStopped>) =>
    observeReviewWritersStopped(...args).pipe(waitForNativeRetirement)
)
