import { Config, Effect, FileSystem, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands, makeTracker } from "../delivery/tracker.ts"
import { nativeOperationIndex } from "./command-invocation.ts"

const ACK_ARGUMENTS = 3
const JSON_OFFSET = 2
/** Public native acknowledgement records a request, never a stopped-writer receipt. */
export const NativeActorAcknowledgement = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  command: Schema.Literal("runtime drain-ack"),
  action: Schema.Literal("drain-ack"),
  session: Schema.NonEmptyString,
  status: Schema.Literal("acknowledged")
})

/** The actor requests its own native retirement; acknowledgement is not stopped custody. */
export const acknowledgeActorRetirement = Effect.fn("Native.acknowledgeActorRetirement")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  node: BeadId
) {
  const session = yield* Config.schema(BeadId, "GC_SESSION_ID")
  const name = yield* Config.NonEmptyString("GC_SESSION_NAME")
  yield* Config.NonEmptyString("GC_INSTANCE_TOKEN")
  const completed = yield* tracker.bead(node)
  if (completed.status !== "closed" || completed.metadata?.["gc.session_id"] !== session)
    return yield* new BoundaryFailure({ message: "actor retirement requires its own completed native work" })
  const fs = yield* FileSystem.FileSystem
  const directory = `${config.root}/evidence/actor-retirement`
  yield* fs.makeDirectory(directory, { recursive: true })
  const locator = encodeURIComponent(session)
  const acknowledgement = yield* commands
    .execute(config.root, ["gc", "--city", config.city, "runtime", "drain-ack", "--json"], undefined, undefined, {
      stdout: `${directory}/${locator}.stdout`,
      stderr: `${directory}/${locator}.stderr`
    })
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeActorAcknowledgement))))
  if (acknowledgement.session !== name)
    return yield* new BoundaryFailure({ message: "native retirement acknowledgement names another runtime" })
})

/** Only self-ack delegates lifecycle custody; external operator/target variants are excluded. */
export function nativeActorRetirement(args: ReadonlyArray<string>): boolean {
  const operation = nativeOperationIndex(args)
  if (operation === undefined || args[0] !== "gc") return false
  return (
    args[operation] === "runtime" &&
    args[operation + 1] === "drain-ack" &&
    args[operation + JSON_OFFSET] === "--json" &&
    args.length === operation + ACK_ARGUMENTS
  )
}
