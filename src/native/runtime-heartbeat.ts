import { Clock, Effect, Schema } from "effect"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { type BeadId, BoundaryFailure } from "../domain/shared.ts"
import { nativeOperationIndex } from "./command-invocation.ts"

const HEARTBEAT_SECONDS = 2400
const MILLISECONDS_PER_SECOND = 1000
const HEARTBEAT_ARGUMENTS = 4
const JSON_OFFSET = 3
const DURATION_OFFSET = 2
const ENVIRONMENT_PREFIX = 8
const SESSION_ENVIRONMENT_OFFSET = 5
const NAME_ENVIRONMENT_OFFSET = 6
const CITY_ENVIRONMENT_OFFSET = 7
const ExplicitContext = Schema.Struct({
  prefix: Schema.Literal("env\0-u\0GC_ALIAS\0-u\0GC_CITY"),
  session: Schema.String.check(Schema.isPattern(/^GC_SESSION_ID=.+$/)),
  name: Schema.String.check(Schema.isPattern(/^GC_TMUX_SESSION=.+$/)),
  city: Schema.String.check(Schema.isPattern(/^GC_CITY_PATH=\/.+$/))
})
const Heartbeat = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  command: Schema.Literal("runtime heartbeat"),
  session: Schema.String.check(Schema.isMinLength(1)),
  held_until: Schema.DateFromString
})

/** One finite native hold per deterministic role invocation; GC owns its expiration. */
export const runtimeHeartbeat = Effect.fn("Native.runtimeHeartbeat")(function* (
  config: RuntimeConfig,
  commands: Commands,
  session: BeadId,
  sessionName: string
) {
  const receipt = yield* commands
    .execute(config.root, [
      "env",
      "-u",
      "GC_ALIAS",
      "-u",
      "GC_CITY",
      `GC_SESSION_ID=${session}`,
      `GC_TMUX_SESSION=${sessionName}`,
      `GC_CITY_PATH=${config.city}`,
      "gc",
      "--city",
      config.city,
      "runtime",
      "heartbeat",
      `--duration=${HEARTBEAT_SECONDS}s`,
      "--json"
    ])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Heartbeat))))
  const now = yield* Clock.currentTimeMillis
  if (
    receipt.held_until.getTime() <= now ||
    receipt.held_until.getTime() > now + HEARTBEAT_SECONDS * MILLISECONDS_PER_SECOND
  )
    return yield* new BoundaryFailure({ message: "native heartbeat did not acknowledge a finite future hold" })
})

/** Only the exact finite heartbeat API delegates timer custody to GC. */
function heartbeatInvocation(args: ReadonlyArray<string>): ReadonlyArray<string> | undefined {
  if (args[0] !== "env") return args
  if (
    !Schema.is(ExplicitContext)({
      prefix: args.slice(0, SESSION_ENVIRONMENT_OFFSET).join("\0"),
      session: args[SESSION_ENVIRONMENT_OFFSET],
      name: args[NAME_ENVIRONMENT_OFFSET],
      city: args[CITY_ENVIRONMENT_OFFSET]
    })
  )
    return undefined
  return args.slice(ENVIRONMENT_PREFIX)
}

export function nativeRuntimeHeartbeat(args: ReadonlyArray<string>): boolean {
  const invocation = heartbeatInvocation(args)
  if (!invocation) return false
  const operation = nativeOperationIndex(invocation)
  if (operation === undefined) return false
  return (
    invocation[operation] === "runtime" &&
    invocation[operation + 1] === "heartbeat" &&
    invocation[operation + DURATION_OFFSET] === `--duration=${HEARTBEAT_SECONDS}s` &&
    invocation[operation + JSON_OFFSET] === "--json" &&
    invocation.length === operation + HEARTBEAT_ARGUMENTS
  )
}
