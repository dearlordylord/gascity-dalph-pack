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

/** The workflow repeats native close only after observing exact terminal pool custody. */
export const NativeStopIntent = Schema.Struct({
  version: Schema.Literal(1),
  session: BeadId,
  node: BeadId,
  path: AbsolutePath,
  template: Schema.String
})
const CloseResponse = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  action: Schema.Literal("close"),
  session_id: BeadId,
  state: Schema.Literal("closed")
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
  const retained = yield* tracker.fact(intent.node, key, NativeStopIntent)
  if (retained && canonical(retained) !== canonical(intent))
    return yield* new BoundaryFailure({ message: "native stop belongs to another session incarnation or workspace" })
  const writer = yield* tracker.bead(intent.node)
  if (disposition._tag === "RetainedRecovery")
    yield* confirmStoppedSession(yield* nativeSession(config, commands, session.id), intent, tracker)
  else if (writer.status !== "closed")
    return yield* new BoundaryFailure({ message: "native writer has unfinished work; external stop is not authorized" })
  const retired = yield* retiredPoolSession(config, commands, session.id)
  yield* confirmStoppedSession(retired, intent, tracker)
  if (!retained) yield* tracker.record(intent.node, key, intent)
  // Repeat the native idempotent boundary even for a closed row or a lost response.
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
})
