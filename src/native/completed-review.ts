import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import { canonical } from "../delivery/files.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { NativeAttempt, type NativeSession } from "./contract.ts"
import { NativeReviewVerdict } from "./review-contract.ts"
import { reviewFactKey } from "./review-fact-key.ts"
import { completedReassignedWork } from "./completed-work.ts"

/** Closed reviewer retries require exact retained verdict and immutable attempt history. */
export const retainedReviewMatches = Effect.fn("Native.retainedReviewMatches")(function* (
  tracker: ReturnType<typeof makeTracker>,
  current: Bead,
  attempt: typeof NativeAttempt.Type,
  verdict: NativeReviewVerdict
) {
  const retained = yield* tracker.fact(
    current.id,
    reviewFactKey("native_review", verdict.batch, verdict.round),
    NativeReviewVerdict
  )
  const declared = yield* tracker.fact(current.id, "native_attempt", NativeAttempt)
  if (!retained || canonical(retained) !== canonical(verdict) || canonical(declared) !== canonical(attempt))
    return yield* new BoundaryFailure({ message: "review session/task/worktree correlation has no retained verdict" })
})

/** A retained verdict can outlive its reviewer session's current native assignment. */
export const correlateCompletedReview = Effect.fn("Native.correlateCompletedReview")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  current: Bead,
  attempt: typeof NativeAttempt.Type,
  verdict: NativeReviewVerdict,
  session: typeof NativeSession.Type
) {
  yield* retainedReviewMatches(tracker, current, attempt, verdict)
  yield* completedReassignedWork(
    config,
    commands,
    tracker,
    { node: current.id, path: attempt.plan.path, template: current.metadata?.["gc.run_target"] },
    session
  ).pipe(
    Effect.mapError(
      (error) =>
        new BoundaryFailure({ message: `review session/task/worktree correlation is unproven: ${String(error)}` })
    )
  )
})
