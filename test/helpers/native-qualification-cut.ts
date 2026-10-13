import { Config, Effect, FileSystem, Schedule, Schema } from "effect"
import { AbsolutePath } from "../../src/domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../../src/domain/shared.ts"

/** Fixture-only ESM entry barrier: no task claim, Git operation or child process. */
export const holdQualification = Effect.gen(function* () {
  const root = yield* Config.schema(AbsolutePath, "DALPH_TRIAL_ROOT")
  const session = yield* Config.schema(BeadId, "GC_SESSION_ID")
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(`${root}/qualification-cut-${session}.json`, JSON.stringify({ session }))
  yield* Effect.gen(function* () {
    const release = `${root}/qualification-release.json`
    if (!(yield* fs.exists(release))) return yield* new BoundaryFailure({ message: "qualification release pending" })
    const permitted = yield* fs
      .readFileString(release)
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ session: BeadId })))))
    if (permitted.session !== session)
      return yield* new BoundaryFailure({ message: "qualification release belongs to another session" })
  }).pipe(Effect.retry({ schedule: Schedule.spaced("100 millis").pipe(Schedule.upTo({ duration: "15 minutes" })) }))
})
