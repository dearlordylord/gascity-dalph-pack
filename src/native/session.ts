import { nativeTrackerArgs } from "./tracker-command.ts"
import { Effect, Schema } from "effect"
import { BirthTicks, BoundaryFailure, type BeadId } from "../domain/shared.ts"
import type { Commands } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { markedProcesses } from "../delivery/process-observation.ts"
import { NativeSession, NativeSessionPending, type NativeProposal, type NativeAttempt } from "./contract.ts"

export const nativeSession = Effect.fn("Native.session")(function* (
  config: RuntimeConfig,
  commands: Commands,
  id: BeadId
) {
  const session = yield* commands
    .execute(
      config.root,
      nativeTrackerArgs(["env", "GC_NO_API=1", "gc", "--city", config.city, "beads", "show", id, "--format=json"])
    )
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeSession))))
  if (session.id !== id) return yield* new BoundaryFailure({ message: "native observation returned another session" })
  return session
})
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
  if (
    proposal.attempt !== attempt.plan.attempt ||
    proposal.base !== attempt.plan.base ||
    proposal.task !== attempt.task ||
    proposal.path !== attempt.plan.path
  )
    return yield* new BoundaryFailure({ message: "native proposal belongs to a different immutable attempt" })
  return session
})
export const stoppedNativeSession = Effect.fn("Native.stoppedSession")(function* (
  config: RuntimeConfig,
  commands: Commands,
  proposal: typeof NativeProposal.Type,
  attempt: typeof NativeAttempt.Type
) {
  const session = yield* correlatedSession(config, commands, proposal, attempt)
  if (session.status !== "closed" || !["closed", "dead-runtime"].includes(session.metadata.state ?? ""))
    return yield* new NativeSessionPending({
      message: "native session is live or uncertain; retain occupied task position"
    })
  const writers = yield* markedProcesses(`GC_SESSION_ID=${proposal.session}`, BirthTicks.make(1), commands.owner)
  if (writers.length)
    return yield* new NativeSessionPending({ message: "native descendants remain; retain occupied task position" })
})
