import { Effect, Schema } from "effect"
import { Plan, type Prepared, Publication } from "../domain/attempt.ts"
import { canonical } from "../delivery/files.ts"
import { retainedCandidate } from "../delivery/candidate-refresh.ts"
import type { Bead, makeTracker } from "../delivery/tracker.ts"
import type { NativeAttempt } from "./contract.ts"

const CleanupIntent = Schema.Struct({ plan: Plan, attempt_id: Plan.fields.attempt })
const intentMatches = (
  intent: typeof CleanupIntent.Type | null,
  attempt: typeof NativeAttempt.Type,
  prepared: typeof Prepared.Type
) =>
  !!intent && canonical(intent.plan) === canonical(attempt.plan) && intent.attempt_id === prepared.provenance.attempt_id

/** Applied cleanup can remove the source tree before its native response is observed. */
export const cleanupMayResume = Effect.fn("Native.cleanupMayResume")(function* (
  tracker: ReturnType<typeof makeTracker>,
  delivery: Bead,
  attempt: typeof NativeAttempt.Type,
  prepared: typeof Prepared.Type
) {
  const intent = yield* tracker.fact(delivery.id, "work_cleanup_intent", CleanupIntent)
  if (!intentMatches(intent, attempt, prepared)) return false
  const candidate = (yield* retainedCandidate(tracker, delivery.id)).candidate
  const published = yield* tracker.fact(delivery.id, "published", Publication)
  const promoted = yield* tracker.fact(delivery.id, "promoted", Publication)
  return !!candidate && published?.commit === candidate.commit && promoted?.commit === candidate.commit
})
