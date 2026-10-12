import { Schema } from "effect"
import { BeadId, NonNegativeInteger } from "../domain/shared.ts"
import { NativeProposal } from "./contract.ts"

const Text = Schema.String.check(Schema.isMinLength(1))
export const REVIEW_ROUNDS = 4
export const ReviewRound = NonNegativeInteger.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(REVIEW_ROUNDS))
export const ReviewCandidate = Schema.Struct({ commit: NativeProposal.fields.commit })
export const ReviewFinding = Schema.Struct({
  id: Text,
  message: Text,
  disposition: Schema.Literals(["blocking", "nonblocking"])
})
export type ReviewFinding = typeof ReviewFinding.Type

/** Semantic evidence belongs to one native review node and immutable candidate. */
export const NativeReviewVerdict = Schema.Struct({
  version: Schema.Literal(1),
  node: BeadId,
  session: BeadId,
  round: ReviewRound,
  batch: Text,
  attempt: NativeProposal.fields.attempt,
  task: NativeProposal.fields.task,
  base: NativeProposal.fields.base,
  commit: NativeProposal.fields.commit,
  basis: Schema.Struct({
    requirements: Schema.Literal(true),
    projectContract: Schema.Literal(true),
    baseToCandidate: Schema.Literal(true)
  }),
  findings: Schema.Array(ReviewFinding)
})
export type NativeReviewVerdict = typeof NativeReviewVerdict.Type

export class ReviewInfrastructureFailure extends Schema.TaggedError<ReviewInfrastructureFailure>()(
  "ReviewInfrastructureFailure",
  { message: Schema.String }
) {}

export class ReviewBlocking extends Schema.TaggedError<ReviewBlocking>()("ReviewBlocking", {
  round: ReviewRound,
  findings: Schema.Array(ReviewFinding)
}) {}
