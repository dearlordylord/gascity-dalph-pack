import { Config, Console, Effect, FileSystem, Schema } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { BoundaryFailure } from "../../src/domain/shared.ts"

/** Controlled public command port: reply to exact argv, without claiming or filtering tracker data. */
const main = Effect.gen(function* () {
  const path = yield* Config.String("DALPH_READY_PORT")
  const fs = yield* FileSystem.FileSystem
  const fixture = yield* fs
    .readFileString(path)
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Struct({
              prefix: Schema.Array(Schema.String),
              responses: Schema.Array(
                Schema.Struct({ args: Schema.Array(Schema.String), output: Schema.String, fail: Schema.Boolean })
              )
            })
          )
        )
      )
    )
  const args = process.argv.slice(2)
  yield* fs.writeFileString(`${path}.trace`, JSON.stringify(args) + "\n", { flag: "a" })
  if (!fixture.prefix.every((arg, index) => args[index] === arg))
    return yield* new BoundaryFailure({ message: "unexpected native ready command prefix" })
  const response = fixture.responses.find((entry) => JSON.stringify(entry.args) === JSON.stringify(args))
  if (response?.fail) return yield* new BoundaryFailure({ message: "controlled native query failure" })
  yield* Console.log(response?.output ?? "[]")
})

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
