import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { stopNativeWriter } from "./session-stop.ts"
import { type NativeProposal, type NativeAttempt } from "./contract.ts"

import { nativeSession } from "./session-observation.ts"
import { completedReassignedProducer } from "./completed-producer.ts"
import { proposalMatchesAttempt } from "./proposal-identity.ts"
import { waitForNativeRetirement } from "./retirement.ts"
export { nativeSession } from "./session-observation.ts"

export const correlatedSession = Effect.fn("Native.correlatedSession")(function* (
  config: RuntimeConfig,
  commands: Commands,
  proposal: typeof NativeProposal.Type,
  attempt: typeof NativeAttempt.Type
) {
  const session = yield* nativeSession(config, commands, proposal.session)
  const facts = session.metadata
  if (
    facts["gc.trigger_bead_id"] !== attempt.plan.bead ||
    facts.work_dir !== attempt.plan.path ||
    facts.template !== attempt.contract.agent
  )
    return yield* new BoundaryFailure({ message: "native session/task/worktree correlation is unproven" })
  if (!proposalMatchesAttempt(proposal, attempt))
    return yield* new BoundaryFailure({ message: "native proposal belongs to a different immutable attempt" })
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
  const session = yield* correlatedSession(config, commands, proposal, attempt)
  yield* stopNativeWriter(config, commands, tracker, session)
})
export const stoppedNativeSession = Effect.fn("Native.stoppedSession")(
  (...args: Parameters<typeof observeStoppedNativeSession>) =>
    observeStoppedNativeSession(...args).pipe(waitForNativeRetirement)
)
