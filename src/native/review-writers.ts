import { Effect } from "effect"
import { type BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import { stopNativeWriter } from "./session-stop.ts"
import { nativeSession } from "./session.ts"
import { nativeWriterNode, reviewSessionMatches } from "./review-correlation.ts"
import { nativeWriterInventory } from "./session-inventory.ts"
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
  const seen = new Set<BeadId>()
  for (const entry of entries) {
    const session = yield* nativeSession(config, commands, entry.id)
    const node = nativeWriterNode(rows, session, ["work", "fix", "review"])
    if (!node) {
      if (yield* historicalWritersStopped(config, commands, tracker, rows, path, session)) {
        seen.add(session.id)
        continue
      }
      if (session.metadata.work_dir === path)
        return yield* new BoundaryFailure({ message: "unrelated native writer shares the attempt workspace" })
      continue
    }
    if (!reviewSessionMatches(session, node, path))
      return yield* new BoundaryFailure({
        message: `native writer has contradictory session/worktree/template correlation: session ${session.id}, node ${node.id}, trigger ${session.metadata["gc.trigger_bead_id"]}, workspace ${session.metadata.work_dir}, template ${session.metadata.template}; expected ${path}, ${node.metadata?.["gc.run_target"]}`
      })
    seen.add(session.id)
    yield* stopNativeWriter(config, commands, tracker, session)
  }
  if (required.some((id) => !seen.has(id)))
    return yield* new BoundaryFailure({ message: "native review/fix writer inventory is incomplete" })
})
export const reviewWritersStopped = Effect.fn("NativeReview.writersStopped")(
  (...args: Parameters<typeof observeReviewWritersStopped>) =>
    observeReviewWritersStopped(...args).pipe(waitForNativeRetirement)
)
