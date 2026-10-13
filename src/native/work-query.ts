import { basename } from "node:path"
import { Effect, Schema } from "effect"
import { AbsolutePath } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"

/** Native template identity supplied by Gas City's query environment. */
const Template = Schema.NonEmptyString.pipe(Schema.brand("NativeQueryTemplate"))
/** Runtime name and alias are distinct from the session bead identity. */
const RuntimeName = Schema.NonEmptyString.pipe(Schema.brand("NativeQueryRuntimeName"))
const Alias = Schema.NonEmptyString.pipe(Schema.brand("NativeQueryAlias"))
export const NativeQuerySettings = Schema.Struct({
  template: Template,
  session: Schema.optionalKey(BeadId),
  name: Schema.optionalKey(RuntimeName),
  alias: Schema.optionalKey(Alias),
  directory: Schema.optionalKey(AbsolutePath)
})
export type NativeQuerySettings = typeof NativeQuerySettings.Type
export interface NativeReadyReader {
  readonly execute: (args: ReadonlyArray<string>) => Effect.Effect<string, BoundaryFailure>
}

const READ_CONCURRENCY = 4
const ROW_LIMIT = "20"
const Arrays = Schema.fromJsonString(Schema.Array(Schema.Json))

function queryArguments(settings: NativeQuerySettings) {
  const workspace = settings.session && settings.directory ? basename(settings.directory) : null
  const prefix = [
    "ready",
    "--metadata-field",
    `gc.routed_to=${settings.template}`,
    ...(workspace ? ["--metadata-field", `gc.pack_workspace=${workspace}`] : []),
    "--exclude-type=epic",
    "--sort",
    "oldest",
    "--limit",
    ROW_LIMIT,
    "--json"
  ]
  const identities = [settings.session, settings.name, settings.alias].filter((identity) => identity !== undefined)
  return [
    ...identities.map((identity) => [...prefix, "--status", "in_progress", "--assignee", identity]),
    ...identities.map((identity) => [...prefix, "--assignee", identity]),
    [...prefix, "--unassigned"]
  ]
}

/** Concurrent read snapshots keep tier order; Gas City's hook owns validation and claiming. */
export const nativeWorkQuery = Effect.fn("Native.workQuery")(function* (
  settings: NativeQuerySettings,
  reader: NativeReadyReader
) {
  if (settings.session && (!settings.directory || !basename(settings.directory)))
    return yield* new BoundaryFailure({ message: "native seat work query requires GC_DIR" })
  const arrays = yield* Effect.forEach(
    queryArguments(settings),
    (args) =>
      reader.execute(args).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Arrays)),
        Effect.mapError((error) => new BoundaryFailure({ message: `native ready query failed: ${String(error)}` }))
      ),
    { concurrency: READ_CONCURRENCY }
  )
  return arrays.flat()
})
