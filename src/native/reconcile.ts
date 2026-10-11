import { Effect, Schema } from "effect"
import { BeadId, BirthTicks, BoundaryFailure } from "../domain/shared.ts"
import type { Commands } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { NativeSession, NativeAttempt } from "./contract.ts"
import { markedProcesses } from "../delivery/process-observation.ts"
import { nativeSession } from "./session.ts"

const Inventory = Schema.Struct({
  sessions: Schema.Array(Schema.Struct({ id: BeadId, template: Schema.String, closed: Schema.Boolean }))
})
const closedSession = Effect.fn("Native.closedSession")(function* (
  commands: Commands,
  session: typeof NativeSession.Type
) {
  if (!["closed", "dead-runtime"].includes(session.metadata.state ?? ""))
    return yield* new BoundaryFailure({ message: "retained native session state is uncertain; resume blocked" })
  if ((yield* markedProcesses(`GC_SESSION_ID=${session.id}`, BirthTicks.make(1), commands.owner)).length)
    return yield* new BoundaryFailure({ message: "retained native descendants remain; resume blocked" })
})
const liveSession = Effect.fn("Native.liveSession")(function* (session: typeof NativeSession.Type) {
  if (session.metadata.state !== "awake")
    return yield* new BoundaryFailure({ message: "open native session liveness is uncertain; resume blocked" })
})
export const reconcileNativeAttempt = Effect.fn("Native.reconcileAttempt")(function* (
  config: RuntimeConfig,
  commands: Commands,
  attempt: typeof NativeAttempt.Type
) {
  const inventory = yield* commands
    .execute(config.root, ["gc", "--city", config.city, "session", "list", "--state", "all", "--json"])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Inventory))))
  let occupied = 0
  for (const row of inventory.sessions.filter((row) => row.template === attempt.contract.agent)) {
    const session = yield* nativeSession(config, commands, row.id)
    if (session.metadata["gc.trigger_bead_id"] !== attempt.plan.bead) continue
    if (session.metadata.work_dir !== attempt.plan.path || session.metadata.template !== attempt.contract.agent)
      return yield* new BoundaryFailure({ message: "retained native session has contradictory worktree correlation" })
    if (!row.closed || session.status !== "closed") {
      yield* liveSession(session)
      occupied++
    } else yield* closedSession(commands, session)
  }
  if (occupied > 1)
    return yield* new BoundaryFailure({
      message: "multiple retained native writers; resume refused without freeing capacity"
    })
})
