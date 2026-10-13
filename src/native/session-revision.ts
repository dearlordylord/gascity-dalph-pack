import { Effect, Schema } from "effect"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { BeadId } from "../domain/shared.ts"
import type { NativeSession } from "./contract.ts"
import { nativeTrackerArgs } from "./tracker-command.ts"

/** Opaque signed row token from the native store; equality only, never numeric ordering. */
export const SessionRevision = Schema.String.check(Schema.isPattern(/^-?[1-9][0-9]*$/)).pipe(
  Schema.brand("SessionRevision")
)
const Detail = Schema.Struct({
  id: BeadId,
  status: Schema.Literal("closed"),
  issue_type: Schema.Literal("session"),
  revision: SessionRevision,
  metadata: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean, Schema.Number]))
})

/** An unavailable fence only disables reuse; stock close remains mandatory. */
export const sessionRevision = Effect.fn("Native.sessionRevision")(function* (
  config: RuntimeConfig,
  commands: Commands,
  session: typeof NativeSession.Type
) {
  return yield* commands
    .execute(
      config.root,
      nativeTrackerArgs(["env", "GC_NO_API=1", "gc", "--city", config.city, "bd", "show", session.id, "--json"])
    )
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Detail)))),
      Effect.map((rows) => {
        const row = rows[0]
        if (rows.length !== 1 || !row || row.id !== session.id) return null
        for (const key of [
          "work_dir",
          "template",
          "current_claim_bead_id",
          "pool_managed",
          "session_origin",
          "configured_named_session",
          "manual_session"
        ])
          if ((row.metadata[key] === undefined ? undefined : String(row.metadata[key])) !== session.metadata[key])
            return null
        return row.revision
      }),
      Effect.catch(() => Effect.succeed(null))
    )
})
