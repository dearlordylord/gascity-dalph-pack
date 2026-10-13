import { Config, Console, Duration, Effect, Schema } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { NativeQuerySettings, nativeWorkQuery } from "../src/native/work-query.ts"
import { BoundaryFailure } from "../src/domain/shared.ts"
import { runCommand } from "../src/quality/command.ts"

const READ_TIMEOUT_SECONDS = 30

const settings = Config.unwrap({
  template: Config.schema(NativeQuerySettings.fields.template, "GC_TEMPLATE"),
  session: Config.String("GC_SESSION_ID").pipe(Config.withDefault("")),
  name: Config.String("GC_SESSION_NAME").pipe(Config.withDefault("")),
  alias: Config.String("GC_ALIAS").pipe(Config.withDefault("")),
  directory: Config.String("GC_DIR").pipe(Config.withDefault(""))
})

NodeRuntime.runMain(
  Effect.gen(function* () {
    const input = yield* settings
    const query = yield* Schema.decodeUnknownEffect(NativeQuerySettings)({
      template: input.template,
      ...(input.session ? { session: input.session } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.alias ? { alias: input.alias } : {}),
      ...(input.session && input.directory ? { directory: input.directory.replace(/\/+$/, "") || "/" } : {})
    })
    const result = yield* nativeWorkQuery(query, {
      execute: (args) =>
        runCommand({ executable: "gc", args, timeout: Duration.seconds(READ_TIMEOUT_SECONDS) }).pipe(
          Effect.map((result) => result.stdout),
          Effect.mapError((error) => new BoundaryFailure({ message: String(error) }))
        )
    })
    yield* Console.log(JSON.stringify(result))
  }).pipe(Effect.provide(NodeServices.layer))
)
