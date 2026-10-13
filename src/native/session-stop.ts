import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { AbsolutePath } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import { canonical } from "../delivery/files.ts"
import type { NativeSession } from "./contract.ts"
import { nativeSession } from "./session-observation.ts"
import { retiredPoolSession } from "./retirement.ts"
import { SessionRevision, sessionRevision } from "./session-revision.ts"

/** The workflow repeats native close only after observing exact terminal pool custody. */
export const NativeStopIntent = Schema.Struct({
  version: Schema.Literal(1),
  session: BeadId,
  node: BeadId,
  path: AbsolutePath,
  template: Schema.String
})
/** One immutable stable-close fence per session; changed tokens fall back to native close. */
const StableClose = Schema.Struct({ intent: NativeStopIntent, revision: SessionRevision })
const CloseResponse = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  action: Schema.Literal("close"),
  session_id: BeadId,
  state: Schema.Literal("closed")
})
/** Known native close outcome; fresh terminal custody is still required on every use. */
export const NativeStopObservation = Schema.Struct({
  version: Schema.Literal(1),
  intent: NativeStopIntent,
  response: CloseResponse
})
/** Recovery retires an already closed native session without completing its retained task. */
export type NativeStopDisposition = { readonly _tag: "CompletedWork" } | { readonly _tag: "RetainedRecovery" }
/** Bounded tracker key; full native identity remains in the correlated intent. */
export const nativeStopKey = (session: typeof BeadId.Type) =>
  `native_stop_${createHash("sha256").update(session).digest("hex")}`

const confirmStoppedSession = Effect.fn("Native.confirmStoppedSession")(function* (
  stopped: typeof NativeSession.Type,
  intent: typeof NativeStopIntent.Type,
  tracker: ReturnType<typeof makeTracker>
) {
  const writer = yield* tracker.bead(intent.node)
  if (
    stopped.status !== "closed" ||
    !stopBindingMatches(stopped, writer, intent) ||
    stopped.metadata.work_dir !== intent.path ||
    stopped.metadata.template !== intent.template
  )
    return yield* new BoundaryFailure({ message: "native close did not establish exact stopped session custody" })
})

const stopBindingMatches = (session: typeof NativeSession.Type, writer: Bead, intent: typeof NativeStopIntent.Type) => {
  const claim = session.metadata.current_claim_bead_id
  return (
    (!claim || claim === intent.node) &&
    writer.metadata?.["gc.session_id"] === intent.session &&
    writer.metadata?.["gc.run_target"] === intent.template
  )
}

const confirmedClose = Effect.fn("Native.confirmedClose")(function* (
  writer: Bead,
  intent: typeof NativeStopIntent.Type,
  key: string
) {
  const observed = yield* retainedFact(writer, `${key}_observed`, NativeStopObservation)
  if (!observed) return null
  if (canonical(observed.intent) !== canonical(intent) || observed.response.session_id !== intent.session)
    return yield* new BoundaryFailure({ message: "retained native close outcome belongs to another stop identity" })
  return observed
})

const retainedFact = <A>(writer: Bead, key: string, schema: Schema.ConstraintDecoder<A, never>) => {
  const encoded = writer.metadata?.[`dalph.${key}`]
  return encoded ? Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(encoded) : Effect.succeed(null)
}

function stopIntentConflicts(retained: typeof NativeStopIntent.Type | null, intent: typeof NativeStopIntent.Type) {
  return !!retained && canonical(retained) !== canonical(intent)
}

const retainCloseObservation = Effect.fn("Native.retainCloseObservation")(function* (
  tracker: ReturnType<typeof makeTracker>,
  node: BeadId,
  key: string,
  retained: typeof NativeStopObservation.Type | null,
  observation: typeof NativeStopObservation.Type
) {
  if (retained && canonical(retained) === canonical(observation)) return
  yield* tracker.record(node, `${key}_observed`, observation)
})

export const stopNativeWriter = Effect.fn("Native.stopWriter")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  session: typeof NativeSession.Type,
  node: typeof BeadId.Type,
  disposition: NativeStopDisposition = { _tag: "CompletedWork" }
) {
  const intent = yield* Schema.decodeUnknownEffect(NativeStopIntent)({
    version: 1,
    session: session.id,
    node,
    path: session.metadata.work_dir,
    template: session.metadata.template
  })
  const key = nativeStopKey(session.id)
  const writer = yield* tracker.bead(intent.node)
  const retained = yield* retainedFact(writer, key, NativeStopIntent)
  if (stopIntentConflicts(retained, intent))
    return yield* new BoundaryFailure({ message: "native stop belongs to another session incarnation or workspace" })
  const observed = yield* confirmedClose(writer, intent, key)
  if (disposition._tag === "CompletedWork" && writer.status !== "closed")
    return yield* new BoundaryFailure({ message: "native writer has unfinished work; external stop is not authorized" })
  const retired = yield* retiredPoolSession(config, commands, session.id)
  yield* confirmStoppedSession(retired, intent, tracker)
  const fence = yield* retainedFact(writer, `${key}_stable`, StableClose)
  const beforeRevision = yield* sessionRevision(config, commands, retired)
  if (reusableClose(retained, observed, fence, intent, beforeRevision)) return
  if (!retained) yield* tracker.record(intent.node, key, intent)
  // Closed rows can be reopened through the public bead API. Without a fresh
  // incarnation fence, historical outcomes cannot replace the idempotent close.
  // Gas City owns runtime teardown and subsequent orphan reconciliation.
  const response = yield* commands
    .execute(config.root, ["gc", "--city", config.city, "session", "close", session.id, "--json"])
    .pipe(
      Effect.flatMap((payload) =>
        Schema.decodeUnknownEffect(Schema.fromJsonString(CloseResponse))(payload).pipe(
          Effect.mapError(
            () =>
              new BoundaryFailure({
                message: "native session close response is invalid; retain custody until its outcome is reconciled"
              })
          )
        )
      )
    )
  if (response.session_id !== session.id)
    return yield* new BoundaryFailure({ message: "native close returned another session" })
  const stopped = yield* nativeSession(config, commands, session.id)
  yield* confirmStoppedSession(stopped, intent, tracker)
  const observation = { version: 1, intent, response } as const
  yield* retainCloseObservation(tracker, intent.node, key, observed, observation)
  const afterRevision = yield* sessionRevision(config, commands, stopped)
  yield* retainStableClose(tracker, key, fence, intent, beforeRevision, afterRevision)
})

function reusableClose(
  retained: typeof NativeStopIntent.Type | null,
  observed: typeof NativeStopObservation.Type | null,
  fence: typeof StableClose.Type | null,
  intent: typeof NativeStopIntent.Type,
  revision: typeof SessionRevision.Type | null
) {
  return (
    !!retained &&
    !!observed &&
    !!fence &&
    revision !== null &&
    canonical(fence.intent) === canonical(intent) &&
    fence.revision === revision
  )
}
const retainStableClose = Effect.fn("Native.retainStableClose")(function* (
  tracker: ReturnType<typeof makeTracker>,
  key: string,
  fence: typeof StableClose.Type | null,
  intent: typeof NativeStopIntent.Type,
  before: typeof SessionRevision.Type | null,
  after: typeof SessionRevision.Type | null
) {
  if (!fence && before !== null && before === after)
    yield* tracker.record(intent.node, `${key}_stable`, { intent, revision: before })
})
