import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import { canonical } from "../delivery/files.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { NativeAttempt, NativeProposal, type NativeSession } from "./contract.ts"
import { completedReassignedWork } from "./completed-work.ts"
import { proposalMatchesAttempt } from "./proposal-identity.ts"
import { ephemeralPoolSession } from "./pool-policy.ts"
import { retainedFact } from "./retained-fact.ts"

const historyMatches = (original: Bead, session: typeof NativeSession.Type) =>
  original.status === "closed" && original.metadata?.["gc.session_id"] === session.id
const immutableProducerMatches = (
  proposal: typeof NativeProposal.Type,
  attempt: typeof NativeAttempt.Type,
  session: typeof NativeSession.Type
) =>
  proposalMatchesAttempt(proposal, attempt) &&
  session.metadata.template === attempt.contract.agent &&
  ephemeralPoolSession(session)
const retainedHistoryMatches = (
  original: Bead,
  session: typeof NativeSession.Type,
  retainedAttempt: typeof NativeAttempt.Type | null,
  retainedProposal: typeof NativeProposal.Type | null,
  attempt: typeof NativeAttempt.Type,
  proposal: typeof NativeProposal.Type
) =>
  historyMatches(original, session) &&
  canonical(retainedAttempt) === canonical(attempt) &&
  canonical(retainedProposal) === canonical(proposal)

/** Native reassignment ends historical producer ownership without closing its new owner. */
export const completedReassignedProducer = Effect.fn("Native.completedReassignedProducer")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  attempt: typeof NativeAttempt.Type,
  proposal: typeof NativeProposal.Type,
  session: typeof NativeSession.Type
) {
  if (!immutableProducerMatches(proposal, attempt, session))
    return yield* new BoundaryFailure({ message: "completed producer immutable identity is contradictory" })
  const original = yield* tracker.bead(attempt.plan.bead)
  const retainedAttempt = yield* retainedFact(original, "native_attempt", NativeAttempt)
  const retainedProposal = yield* retainedFact(original, "native_proposal", NativeProposal)
  if (!retainedHistoryMatches(original, session, retainedAttempt, retainedProposal, attempt, proposal))
    return yield* new BoundaryFailure({ message: "completed native producer history is unproven" })
  yield* completedReassignedWork(
    config,
    commands,
    tracker,
    { node: attempt.plan.bead, path: attempt.plan.path, template: attempt.contract.agent },
    session
  )
})
