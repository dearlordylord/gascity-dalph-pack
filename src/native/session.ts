import { Effect, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { stopNativeWriter } from "./session-stop.ts"
import { NativeProposal, type NativeAttempt, type NativeSession } from "./contract.ts"
import { canonical } from "../delivery/files.ts"

import { nativeSession } from "./session-observation.ts"
import { completedReassignedProducer } from "./completed-producer.ts"
import { proposalMatchesAttempt } from "./proposal-identity.ts"
import { waitForNativeRetirement } from "./retirement.ts"
export { nativeSession } from "./session-observation.ts"

/** The native claim stamp is distinct from a pool's spawn trigger; empty means cleared. */
const SessionClaim = Schema.Struct({
  current_claim_bead_id: Schema.optionalKey(Schema.Union([BeadId, Schema.Literal("")]))
})
const contradictsClaim = (claim: typeof SessionClaim.Type, node: typeof BeadId.Type) =>
  !!claim.current_claim_bead_id && claim.current_claim_bead_id !== node

/** Active claim proof and retained completed history are separate native authorities. */
const correlateClaim = Effect.fn("Native.correlateClaim")(function* (
  tracker: ReturnType<typeof makeTracker>,
  session: typeof NativeSession.Type,
  proposal: typeof NativeProposal.Type,
  attempt: typeof NativeAttempt.Type
) {
  const writer = yield* tracker.bead(attempt.plan.bead)
  if (writer.metadata?.["gc.session_id"] !== session.id)
    return yield* new BoundaryFailure({ message: "native task belongs to another claiming session" })
  const claim = yield* Schema.decodeUnknownEffect(SessionClaim)(session.metadata)
  if (writer.status !== "closed" && claim.current_claim_bead_id === attempt.plan.bead) return
  if (writer.status !== "closed" || contradictsClaim(claim, writer.id))
    return yield* new BoundaryFailure({ message: "native current claim does not name this attempt" })
  const retained = yield* tracker.fact(writer.id, "native_proposal", NativeProposal)
  if (canonical(retained) !== canonical(proposal))
    return yield* new BoundaryFailure({ message: "cleared native claim has no exact completed proposal history" })
})

export const correlatedSession = Effect.fn("Native.correlatedSession")(function* (
  config: RuntimeConfig,
  commands: Commands,
  proposal: typeof NativeProposal.Type,
  attempt: typeof NativeAttempt.Type,
  tracker: ReturnType<typeof makeTracker>
) {
  const session = yield* nativeSession(config, commands, proposal.session)
  const facts = session.metadata
  if (facts.work_dir !== attempt.plan.path || facts.template !== attempt.contract.agent)
    return yield* new BoundaryFailure({ message: "native session/task/worktree correlation is unproven" })
  if (!proposalMatchesAttempt(proposal, attempt))
    return yield* new BoundaryFailure({ message: "native proposal belongs to a different immutable attempt" })
  yield* correlateClaim(tracker, session, proposal, attempt)
  return session
})
const observeStoppedNativeSession = Effect.fn("Native.observeStoppedSession")(function* (
  config: RuntimeConfig,
  commands: Commands,
  proposal: typeof NativeProposal.Type,
  attempt: typeof NativeAttempt.Type,
  tracker: ReturnType<typeof makeTracker>
) {
  const observed = yield* nativeSession(config, commands, proposal.session)
  if (observed.metadata["gc.trigger_bead_id"] !== attempt.plan.bead) {
    yield* completedReassignedProducer(config, commands, tracker, attempt, proposal, observed)
    return
  }
  const session = yield* correlatedSession(config, commands, proposal, attempt, tracker)
  yield* stopNativeWriter(config, commands, tracker, session)
})
export const stoppedNativeSession = Effect.fn("Native.stoppedSession")(
  (...args: Parameters<typeof observeStoppedNativeSession>) =>
    observeStoppedNativeSession(...args).pipe(waitForNativeRetirement)
)
