import { Schema } from "effect"
import { AttemptId, BeadId, BirthTicks, CommitSha, NonNegativeInteger } from "./shared.ts"

export const AbsolutePath = Schema.String.check(Schema.isPattern(/^\//)).pipe(Schema.brand("AbsolutePath"))
export const Branch = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9/_-]+$/)).pipe(Schema.brand("Branch"))
export const Plan = Schema.Struct({
  bead: BeadId,
  attempt: AttemptId,
  base: CommitSha,
  branch: Branch,
  path: AbsolutePath
})
export type Plan = typeof Plan.Type
export const Prepared = Schema.Struct({ provenance: Schema.Struct({ attempt_id: AttemptId }) })
export const Qualification = Schema.Struct({ commit: CommitSha, exit: NonNegativeInteger, logfile: AbsolutePath })
export const Result = Schema.Struct({ commit: CommitSha, attempt: AttemptId, tests: Qualification })
export const Candidate = Schema.Struct({ commit: CommitSha, head: CommitSha, result: CommitSha, tests: Qualification })
export const Publication = Schema.Struct({ commit: CommitSha })
export const CommandIntent = Schema.Struct({ birth_ticks: BirthTicks })
export const CommandFinished = Schema.Struct({ exit: NonNegativeInteger, commit: Schema.optionalKey(CommitSha) })
export const CommandReconciled = Schema.Struct({ state: Schema.Literal("stopped_without_receipt") })
