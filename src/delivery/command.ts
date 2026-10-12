import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { Clock, Duration, Effect, FileSystem, Ref, Schedule, Schema } from "effect"
import { AttemptId, BirthTicks, BoundaryFailure, ProcessId } from "../domain/shared.ts"
import type { runCommand } from "../quality/command.ts"
import { capture } from "./capture.ts"
import { persistReceipt } from "./files.ts"
import { markedProcesses, parseProcessStat } from "./process-observation.ts"
import { operationalRead } from "../native/operational-read.ts"
import { nativeTrackerCas } from "../native/tracker-cas.ts"
import { nativeSessionClose } from "../native/session-close-command.ts"
import { nativeActorRetirement } from "../native/actor-retirement.ts"
import { nativeRuntimeHeartbeat } from "../native/runtime-heartbeat.ts"
import { nativeHookCommand } from "../native/hook-command.ts"

const MILLISECONDS_PER_SECOND = 1000
const DEFAULT_COMMAND_SECONDS = 30
const LINUX_CLOCK_TICKS = 100
const WRITER_RECHECKS = 100
const delegatedBoundary = (native: boolean, args: ReadonlyArray<string>) =>
  native &&
  (operationalRead(args) ||
    nativeTrackerCas(args) ||
    nativeSessionClose(args) ||
    nativeHookCommand(args) ||
    nativeRuntimeHeartbeat(args) ||
    nativeActorRetirement(args))
export class CommandRejected extends Schema.TaggedError<CommandRejected>()("CommandRejected", {
  message: Schema.String,
  receipt: Schema.String,
  exit: Schema.optionalKey(Schema.Number)
}) {}
const rejected = (path: string, error: Effect.Error<ReturnType<typeof runCommand>>) =>
  new CommandRejected({
    message: `command failed; retained evidence ${path}: ${String(error)}`,
    receipt: path,
    ...(error._tag === "CommandFailure" && error.exit !== undefined ? { exit: error.exit } : {})
  })
const Receipt = Schema.Struct({
  intent: Schema.Struct({
    attempt: Schema.NullOr(AttemptId),
    nonce: Schema.String,
    birth_ticks: BirthTicks,
    owner_pid: ProcessId,
    owner_birth: Schema.String,
    args: Schema.Array(Schema.String),
    cwd: Schema.NullOr(Schema.String),
    timeout_seconds: Schema.Number,
    started: Schema.Number
  }),
  observation: Schema.optionalKey(Schema.Struct({ stopped_writers: Schema.Boolean }))
})

const observedExit = (output: Effect.Success<ReturnType<typeof capture>>) =>
  output._tag === "Success"
    ? { exit: 0 }
    : output.failure._tag === "CommandFailure" && output.failure.exit !== undefined
      ? { exit: output.failure.exit }
      : {}

const commandService = (native: boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const current = yield* Ref.make<AttemptId | null>(null)
    const ticks = LINUX_CLOCK_TICKS // Bootstrap verifies CLK_TCK before any task effects.
    const owner = process.getuid?.()
    if (owner === undefined)
      return yield* new BoundaryFailure({ message: "Linux same-user process observation is required" })
    const birth = Effect.gen(function* () {
      const uptime = yield* fs.readFileString("/proc/uptime")
      return yield* Schema.decodeUnknownEffect(BirthTicks)(Math.floor(Number(uptime.split(" ")[0]) * ticks))
    })
    const nativeResult = Effect.fn("Execution.nativeResult")(function* (
      output: Effect.Success<ReturnType<typeof capture>>,
      path: string,
      stdout: string,
      stderr: string,
      retainLogs: boolean
    ) {
      if (output._tag === "Failure") return yield* rejected(path, output.failure)
      const text = (yield* fs.readFileString(stdout)).trim()
      if (!retainLogs) {
        yield* fs.remove(stdout)
        yield* fs.remove(stderr)
      }
      return text
    })
    const finishCommand = Effect.fn("Execution.finishCommand")(function* (
      path: string,
      stdout: string,
      stderr: string,
      intent: typeof Receipt.Type.intent,
      output: Effect.Success<ReturnType<typeof capture>>
    ) {
      const writers = yield* markedProcesses(`DALPH_BOUNDARY=${intent.nonce}`, intent.birth_ticks, owner).pipe(
        Effect.repeat({
          while: (writers) => writers.length > 0,
          times: WRITER_RECHECKS,
          schedule: Schedule.spaced("50 millis").pipe(Schedule.upTo({ duration: "5 seconds" }))
        })
      )
      const observation = {
        stopped_writers: writers.length === 0,
        writer_pids: [...writers],
        observed: yield* Clock.currentTimeMillis,
        ...observedExit(output),
        outcome: output._tag === "Success" ? "ExitedSuccessfully" : "Failed"
      }
      yield* persistReceipt(path, { intent, observation })
      if (writers.length)
        return yield* new BoundaryFailure({ message: `boundary descendants still live; retain custody: ${path}` })
      if (output._tag === "Failure") return yield* rejected(path, output.failure)
      const text = (yield* fs.readFileString(stdout)).trim()
      return text
    })
    const execute = Effect.fn("Execution.command")(function* (
      root: string,
      args: ReadonlyArray<string>,
      cwd?: string,
      timeout = Duration.seconds(DEFAULT_COMMAND_SECONDS),
      logs?: { readonly stdout: string; readonly stderr: string }
    ) {
      const executable = args[0]
      if (!executable) return yield* new BoundaryFailure({ message: "Command requires an executable" })
      const directory = join(root, "evidence", "boundaries")
      const delegated = delegatedBoundary(native, args)
      yield* fs.makeDirectory(directory, { recursive: true })
      const nonce = yield* Effect.sync(randomUUID)
      const path = join(directory, `${nonce}.json`)
      const { stderr, stdout } = logs ?? {
        stdout: join(directory, `${nonce}.stdout`),
        stderr: join(directory, `${nonce}.stderr`)
      }
      // Native observations and conditional tracker writes have no project-writer custody.
      // Tracker mutations reconcile their exact outcome through the native tracker authority.
      if (delegated) {
        const output = yield* capture(executable, args, cwd, timeout, stdout, stderr, nonce, null)
        return yield* nativeResult(output, path, stdout, stderr, logs !== undefined)
      }
      const start = yield* birth
      const ownerState = yield* fs.readFileString("/proc/self/stat").pipe(Effect.flatMap(parseProcessStat))
      const attempt = yield* Ref.get(current)
      const intent = {
        attempt,
        nonce,
        birth_ticks: start,
        owner_pid: ProcessId.make(process.pid),
        owner_birth: String(ownerState.birth),
        args: [...args],
        cwd: cwd ?? null,
        timeout_seconds: Duration.toMillis(timeout) / MILLISECONDS_PER_SECOND,
        started: (yield* Clock.currentTimeMillis) / MILLISECONDS_PER_SECOND
      }
      yield* persistReceipt(path, { intent })
      const output = yield* capture(executable, args, cwd, timeout, stdout, stderr, nonce, attempt)
      return yield* finishCommand(path, stdout, stderr, intent, output)
    })
    const ownerAlive = Effect.fn("Execution.ownerAlive")(function* (intent: typeof Receipt.Type.intent) {
      const ownerPath = `/proc/${intent.owner_pid}/stat`
      if (!(yield* fs.exists(ownerPath))) return false
      const state = yield* fs.readFileString(ownerPath).pipe(Effect.flatMap(parseProcessStat))
      return state.state !== "Z" && state.state !== "X" && String(state.birth) === intent.owner_birth
    })
    const reconcileReceipt = Effect.fn("Execution.reconcileReceipt")(function* (
      path: string,
      attempt: AttemptId | null,
      onlyOrphans: boolean
    ) {
      const raw = yield* fs.readFileString(path)
      const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Receipt))(raw)
      if (receipt.intent.attempt !== attempt || receipt.observation?.stopped_writers) return
      if (onlyOrphans && (yield* ownerAlive(receipt.intent))) return
      const writers = yield* markedProcesses(
        `DALPH_BOUNDARY=${receipt.intent.nonce}`,
        receipt.intent.birth_ticks,
        owner
      )
      if (writers.length) return yield* new BoundaryFailure({ message: `uncertain boundary has live writers: ${path}` })
      const value = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.JsonObject))(raw)
      const prior = yield* Schema.decodeUnknownEffect(Schema.JsonObject)(value.observation ?? {})
      yield* persistReceipt(path, {
        ...value,
        reconciliation: { state: "stopped_without_success_receipt", observed: yield* Clock.currentTimeMillis },
        observation: { ...prior, stopped_writers: true }
      })
    })
    const reconcile = Effect.fn("Execution.reconcileCommands")(function* (
      root: string,
      attempt: AttemptId | null,
      onlyOrphans = false
    ) {
      const directory = join(root, "evidence", "boundaries")
      if (!(yield* fs.exists(directory))) return
      for (const name of (yield* fs.readDirectory(directory)).filter((name) => name.endsWith(".json"))) {
        yield* reconcileReceipt(join(directory, name), attempt, onlyOrphans)
      }
    })
    return { execute, reconcile, current, birth, owner }
  })
export const makeCommands = commandService(false)
export const makeNativeCommands = commandService(true)
