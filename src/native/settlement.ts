import { Effect, FileSystem, Schema } from "effect"
import { reviewFactKey } from "./review-fact-key.ts"
import { canonical } from "../delivery/files.ts"
import { BoundaryFailure } from "../domain/shared.ts"
import { Candidate, Plan, Publication, Result } from "../domain/attempt.ts"
import type { Bead, makeTracker } from "../delivery/tracker.ts"
import { retainedCandidate } from "../delivery/candidate-refresh.ts"
import { cleanReviewOf, reviewBatch } from "./review-correlation.ts"
import { NativeReviewVerdict, REVIEW_ROUNDS } from "./review-contract.ts"
import { NativeProposal, type NativeAttempt } from "./contract.ts"

type Tracker = ReturnType<typeof makeTracker>
const Cleaned = Schema.Struct({ path: Plan.fields.path, attempt: Plan.fields.attempt })
const publicationProof = Effect.fn("Native.publicationProof")(function* (tracker: Tracker, delivery: Bead) {
  const candidate = (yield* retainedCandidate(tracker, delivery.id)).candidate
  const published = yield* tracker.fact(delivery.id, "published", Publication)
  const promoted = yield* tracker.fact(delivery.id, "promoted", Publication)
  if (!candidate || !published || !promoted)
    return yield* new BoundaryFailure({ message: "closed native delivery is missing publication or promotion proof" })
  if (published.commit !== candidate.commit || promoted.commit !== candidate.commit)
    return yield* new BoundaryFailure({
      message: "closed native delivery has contradictory publication or promotion proof"
    })
  return candidate
})
const reviewedSource = Effect.fn("Native.reviewedSource")(function* (
  tracker: Tracker,
  attempt: typeof NativeAttempt.Type,
  commit: string,
  batch: string
) {
  const work = yield* tracker.bead(attempt.plan.bead)
  if (work.metadata?.["dalph.review_required"] !== "true") return false
  for (let round = 1; round <= REVIEW_ROUNDS; round++) {
    const approved = yield* tracker.fact(work.id, reviewFactKey("native_approved", batch, round), NativeReviewVerdict)
    if (approved && cleanReviewOf(approved, attempt, commit)) return true
  }
  return yield* new BoundaryFailure({ message: "settlement has no exact clean review of its source result" })
})
const sourceCommitMatches = (reviewed: boolean, result: typeof Result.Type, proposal: typeof NativeProposal.Type) =>
  reviewed || result.commit === proposal.commit
const sourceProof = Effect.fn("Native.sourceProof")(function* (
  tracker: Tracker,
  attempt: typeof NativeAttempt.Type,
  candidate: typeof Candidate.Type,
  batch: string
) {
  const result = yield* tracker.fact(attempt.plan.bead, "result", Result)
  const proposal = yield* tracker.fact(attempt.plan.bead, "native_proposal", NativeProposal)
  if (
    proposal &&
    canonical({ attempt: proposal.attempt, base: proposal.base, task: proposal.task, path: proposal.path }) !==
      canonical({ attempt: attempt.plan.attempt, base: attempt.plan.base, task: attempt.task, path: attempt.plan.path })
  )
    return yield* new BoundaryFailure({ message: "closed native proposal belongs to another attempt" })
  if (!result || !proposal)
    return yield* new BoundaryFailure({ message: "closed native delivery has no exact source result proof" })
  if (result.attempt !== attempt.plan.attempt || candidate.result !== result.commit)
    return yield* new BoundaryFailure({ message: "closed native delivery has a contradictory source result" })
  const reviewed = yield* reviewedSource(tracker, attempt, result.commit, batch)
  if (!sourceCommitMatches(reviewed, result, proposal))
    return yield* new BoundaryFailure({ message: "closed native delivery differs from its original proposal" })
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
const candidateCleanupProof = Effect.fn("Native.candidateCleanupProof")(function* (tracker: Tracker, delivery: Bead) {
  const candidatePlan = yield* tracker.fact(delivery.id, "candidate_plan", Plan)
  const initial = yield* tracker.fact(delivery.id, "candidate", Candidate)
  if (!candidatePlan || candidatePlan.bead !== delivery.id || candidatePlan.base !== initial?.head)
    return yield* new BoundaryFailure({ message: "closed native delivery has no candidate plan" })
  yield* cleanupProof(tracker, delivery.id, "candidate", candidatePlan)
})

export const settleNative = Effect.fn("Native.settle")(function* (
  tracker: Tracker,
  delivery: Bead,
  attempt: typeof NativeAttempt.Type
) {
  if (delivery.status !== "closed" || ["fail", "skipped"].includes(delivery.metadata?.["gc.outcome"] ?? ""))
    return false
  const candidate = yield* publicationProof(tracker, delivery)
  yield* sourceProof(tracker, attempt, candidate, reviewBatch(delivery))
  yield* cleanupProof(tracker, delivery.id, "work", attempt.plan)
  yield* candidateCleanupProof(tracker, delivery)
  yield* tracker.record(attempt.plan.bead, "native_settled", { attempt: attempt.plan.attempt })
  return true
})
