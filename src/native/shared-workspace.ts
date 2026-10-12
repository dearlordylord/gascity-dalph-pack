import { basename, dirname } from "node:path"
import { Effect, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, makeTracker } from "../delivery/tracker.ts"
import type { NativeAttempt } from "./contract.ts"

/** A native pool workspace selector, bounded to Gas City's unchanged slug grammar. */
export const WorkspaceSlug = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,94}[a-zA-Z0-9]$/)).pipe(
  Schema.brand("WorkspaceSlug")
)

export const publishSharedWorkspace = Effect.fn("Native.publishSharedWorkspace")(function* (
  config: RuntimeConfig,
  tracker: ReturnType<typeof makeTracker>,
  node: Bead,
  attempt: typeof NativeAttempt.Type
) {
  if (dirname(attempt.plan.path) !== config.worktrees || node.metadata?.["gc.pack"])
    return yield* new BoundaryFailure({
      message: "native shared workspace requires the exact configured root without a pack route"
    })
  const slug = yield* Schema.decodeUnknownEffect(WorkspaceSlug)(basename(attempt.plan.path)).pipe(
    Effect.mapError(
      () => new BoundaryFailure({ message: "native shared workspace slug would be changed by pool routing" })
    )
  )
  yield* tracker.record(node.id, "native_attempt", attempt)
  yield* tracker.metadata(node.id, "gc.pack_workspace", slug)
})
