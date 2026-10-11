import { Schema } from "effect"

/** A tracker identity; Git and process identities use distinct brands. */
export const BeadId = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("BeadId"))
export const AttemptId = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("AttemptId"))
export const CommitSha = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)).pipe(Schema.brand("CommitSha"))
export const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
export const ProcessId = NonNegativeInteger.check(Schema.isGreaterThan(0)).pipe(Schema.brand("ProcessId"))
export const BirthTicks = NonNegativeInteger.pipe(Schema.brand("BirthTicks"))

export class BoundaryFailure extends Schema.TaggedError<BoundaryFailure>()("BoundaryFailure", {
  message: Schema.String
}) {}

export type BeadId = typeof BeadId.Type
export type AttemptId = typeof AttemptId.Type
export type CommitSha = typeof CommitSha.Type
export type ProcessId = typeof ProcessId.Type
export type BirthTicks = typeof BirthTicks.Type
