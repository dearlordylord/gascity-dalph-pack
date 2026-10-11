import { Effect, FileSystem, Option, PlatformError, Schedule, Schema } from "effect"
import { join } from "node:path"
import { BirthTicks, BoundaryFailure, ProcessId } from "../domain/shared.ts"

const AFTER_PROCESS_NAME_OFFSET = 2
const START_TICKS_INDEX = 19
const OBSERVATION_RECHECKS = 3
const processState = Schema.Struct({ state: Schema.String, birth: BirthTicks })
function isTerminal(state: string): boolean {
  return state === "Z" || state === "X"
}
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
  const found: Array<typeof ProcessId.Type> = []
  for (const name of entries.filter((name) => /^\d+$/.test(name))) {
    const path = join(root, name)
    const observe = Effect.gen(function* () {
      const info = yield* fs.stat(path)
      const observedOwner = yield* Schema.decodeUnknownEffect(Schema.Number)(Option.getOrNull(info.uid))
      if (observedOwner !== owner) return false
      const stat = yield* fs.readFileString(join(path, "stat"))
      const state = yield* parseProcessStat(stat)
      if (isTerminal(state.state) || state.birth < birth) return false
      const environment = yield* fs.readFileString(join(path, "environ"))
      // An environment read is evidence only for the incarnation bracketed by
      // these identity reads. A reused PID requires a complete fresh observation.
      const currentInfo = yield* fs.stat(path)
      const current = yield* parseProcessStat(yield* fs.readFileString(join(path, "stat")))
      const currentOwner = yield* Schema.decodeUnknownEffect(Schema.Number)(Option.getOrNull(currentInfo.uid))
      if (currentOwner !== owner || current.birth !== state.birth) {
        return yield* PlatformError.systemError({
          _tag: "Unknown",
          module: "FileSystem",
          method: "markedProcesses",
          pathOrDescriptor: path
        })
      }
      if (isTerminal(current.state)) return false
      return environment.split("\0").includes(marker)
    }).pipe(
      Effect.retry({
        schedule: Schedule.recurs(OBSERVATION_RECHECKS),
        while: (error) => error._tag === "PlatformError" && error.reason._tag !== "NotFound"
      }),
      Effect.catch((error) =>
        error._tag === "PlatformError" && error.reason._tag === "NotFound"
          ? Effect.succeed(false)
          : Effect.fail(new BoundaryFailure({ message: `writer absence unknown at ${path}: ${String(error)}` }))
      )
    )
    if (yield* observe) found.push(yield* Schema.decodeUnknownEffect(ProcessId)(Number(name)))
  }
  return found
})
