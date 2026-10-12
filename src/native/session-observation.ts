import { nativeTrackerArgs } from "./tracker-command.ts"
import { Effect, Schema } from "effect"
import { BoundaryFailure, type BeadId } from "../domain/shared.ts"
import type { Commands } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { NativeSession } from "./contract.ts"

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
