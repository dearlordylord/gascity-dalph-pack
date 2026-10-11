import { Effect, FileSystem, Option, type PlatformError, Schedule, Schema } from "effect"
import { join } from "node:path"
import { BirthTicks, BoundaryFailure, ProcessId } from "../domain/shared.ts"

const AFTER_PROCESS_NAME_OFFSET = 2
const START_TICKS_INDEX = 19
const PERMISSION_RECHECKS = 3
const PROCESS_OBSERVATION_CONCURRENCY = 16
const processState = Schema.Struct({ state: Schema.String, birth: BirthTicks })
export const parseProcessStat = (source: string) => {
  const fields = source
    .slice(source.lastIndexOf(")") + AFTER_PROCESS_NAME_OFFSET)
    .trim()
    .split(/\s+/)
  return Schema.decodeUnknownEffect(processState)({ state: fields[0], birth: Number(fields[START_TICKS_INDEX]) })
}

export const markedProcesses: (
  marker: string,
  birth: BirthTicks,
  owner: number,
  root?: string
) => Effect.Effect<
  Array<typeof ProcessId.Type>,
  BoundaryFailure | Schema.SchemaError | PlatformError.PlatformError,
  FileSystem.FileSystem
> = Effect.fn("Execution.markedProcesses")(function* (
  marker: string,
  birth: BirthTicks,
  owner: number,
  root = "/proc"
) {
  const fs = yield* FileSystem.FileSystem
  const entries = yield* fs.readDirectory(root)
  const observations = yield* Effect.forEach(
    entries.filter((name) => /^\d+$/.test(name)),
    (name) =>
      Effect.gen(function* () {
        const path = join(root, name)
        const observe = Effect.gen(function* () {
          const info = yield* fs.stat(path)
          if (Option.getOrNull(info.uid) !== owner) return false
          const stat = yield* fs.readFileString(join(path, "stat"))
          const state = yield* parseProcessStat(stat)
          if (state.state === "Z" || state.state === "X" || state.birth < birth) return false
          const environment = yield* fs.readFileString(join(path, "environ"))
          return environment.split("\0").includes(marker)
        }).pipe(
          Effect.retry({
            schedule: Schedule.recurs(PERMISSION_RECHECKS),
            while: (error) => error._tag === "PlatformError" && error.reason._tag !== "NotFound"
          }),
          Effect.catch((error) =>
            error._tag === "PlatformError" && error.reason._tag === "NotFound"
              ? Effect.succeed(false)
              : Effect.fail(new BoundaryFailure({ message: `writer absence unknown at ${path}: ${String(error)}` }))
          )
        )
        return (yield* observe) ? [yield* Schema.decodeUnknownEffect(ProcessId)(Number(name))] : []
      }),
    { concurrency: PROCESS_OBSERVATION_CONCURRENCY }
  )
  return observations.flat()
})
