import { Effect, FileSystem, type PlatformError, Schema } from "effect"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { AbsolutePath } from "../domain/attempt.ts"
import { BoundaryFailure } from "../domain/shared.ts"

const recoveryPrefix = [
  "env",
  "-u",
  "DALPH_BOUNDARY",
  "-u",
  "DALPH_ATTEMPT",
  "-u",
  "GC_SESSION_ID",
  "-u",
  "GC_SESSION_NAME",
  "-u",
  "GC_TMUX_SESSION",
  "-u",
  "GC_INSTANCE_TOKEN"
]
/** Native health can recover backend services; this is not stopped-writer evidence. */
export const NativeProviderHealth = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  city_path: AbsolutePath,
  provider: Schema.Literal("bd"),
  status: Schema.Literal("healthy")
})

export function nativeProviderHealthArgs(city: RuntimeConfig["city"]): ReadonlyArray<string> {
  return [...recoveryPrefix, "gc", "--city", city, "beads", "health", "--json"]
}

/** Only the marker-scrubbed native JSON health operation delegates backend custody. */
export function nativeProviderRecovery(args: ReadonlyArray<string>): boolean {
  const operation = recoveryPrefix.length
  const cityOperand = 2
  const operationLength = 6
  const city = args[operation + cityOperand]
  return (
    args.length === operation + operationLength &&
    args.slice(0, operation).join("\0") === recoveryPrefix.join("\0") &&
    !!city?.startsWith("/") &&
    args.slice(operation).join("\0") === ["gc", "--city", city, "beads", "health", "--json"].join("\0")
  )
}

type HealthFailure =
  | Effect.Error<ReturnType<Commands["execute"]>>
  | PlatformError.PlatformError
  | Schema.SchemaError
  | BoundaryFailure
/** FileSystem owns unique diagnostic allocation; commands own the native invocation. */
export const nativeProviderHealth: (
  config: RuntimeConfig,
  commands: Commands
) => Effect.Effect<typeof NativeProviderHealth.Type, HealthFailure, FileSystem.FileSystem> = Effect.fn(
  "Native.providerHealth"
)(function* (config: RuntimeConfig, commands: Commands) {
  const fs = yield* FileSystem.FileSystem
  const directory = `${config.root}/evidence/provider-health`
  yield* fs.makeDirectory(directory, { recursive: true })
  const locator = yield* fs.makeTempDirectory({ directory, prefix: "check-" })
  const logs = { stdout: `${locator}/stdout`, stderr: `${locator}/stderr` }
  const health = yield* commands
    .execute(config.root, nativeProviderHealthArgs(config.city), undefined, undefined, logs)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeProviderHealth))))
  if (health.city_path !== config.city)
    return yield* new BoundaryFailure({
      message: "native provider health names another city; no task launch authorized"
    })
  yield* fs.remove(locator, { recursive: true })
  return health
})
