import { Effect, FileSystem, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import { Candidate, Plan, Publication } from "../domain/attempt.ts"
import type { Bead, makeTracker } from "../delivery/tracker.ts"
import type { NativeAttempt } from "./contract.ts"

type Tracker = ReturnType<typeof makeTracker>
const Cleaned = Schema.Struct({ path: Plan.fields.path, attempt: Plan.fields.attempt })
const publicationProof = Effect.fn("Native.publicationProof")(function* (tracker: Tracker, delivery: Bead) {
  const candidate = yield* tracker.fact(delivery.id, "candidate", Candidate)
  const published = yield* tracker.fact(delivery.id, "published", Publication)
  const promoted = yield* tracker.fact(delivery.id, "promoted", Publication)
  if (!candidate || !published || !promoted)
    return yield* new BoundaryFailure({ message: "closed native delivery is missing publication or promotion proof" })
  if (published.commit !== candidate.commit || promoted.commit !== candidate.commit)
    return yield* new BoundaryFailure({
      message: "closed native delivery has contradictory publication or promotion proof"
    })
})
const cleanupProof = Effect.fn("Native.cleanupProof")(function* (
  tracker: Tracker,
  id: Bead["id"],
  kind: string,
  plan: Plan
) {
  const cleaned = yield* tracker.fact(id, `${kind}_cleaned`, Cleaned)
  if (!cleaned || cleaned.attempt !== plan.attempt || cleaned.path !== plan.path)
    return yield* new BoundaryFailure({ message: `closed native delivery has no exact ${kind} cleanup proof` })
  const fs = yield* FileSystem.FileSystem
  if (yield* fs.exists(plan.path))
    return yield* new BoundaryFailure({ message: "closed native delivery still owns worktree resources" })
})
export const settleNative = Effect.fn("Native.settle")(function* (
  tracker: Tracker,
  delivery: Bead,
  attempt: typeof NativeAttempt.Type
) {
  if (delivery.status !== "closed") return false
  yield* publicationProof(tracker, delivery)
  yield* cleanupProof(tracker, delivery.id, "work", attempt.plan)
  const candidatePlan = yield* tracker.fact(delivery.id, "candidate_plan", Plan)
  if (!candidatePlan) return yield* new BoundaryFailure({ message: "closed native delivery has no candidate plan" })
  yield* cleanupProof(tracker, delivery.id, "candidate", candidatePlan)
  yield* tracker.record(attempt.plan.bead, "native_settled", { attempt: attempt.plan.attempt })
  return true
})
