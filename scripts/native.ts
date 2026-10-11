import * as HttpClient from "effect/http/HttpClient"
import { Config, Console, Effect, FileSystem, Layer, Ref, Schema } from "effect"
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { configuration } from "../src/delivery/config.ts"
import { makeNativeCommands } from "../src/delivery/command.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeGit } from "../src/delivery/git.ts"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { BeadId } from "../src/domain/shared.ts"
import { NativeAttempt, NativeContract } from "../src/native/contract.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { makeNativeWorkflow } from "../src/native/workflow.ts"

const main = Effect.gen(function* () {
  const mode = yield* Schema.decodeUnknownEffect(
    Schema.Literals(["launch", "resume", "prepare", "finish", "check", "integrate"])
  )(process.argv[2])
  const configured = yield* configuration
  const fs = yield* FileSystem.FileSystem
  const contractPath = yield* Config.schema(AbsolutePath, "DALPH_NATIVE_CONTRACT")
  const contract = yield* fs
    .readFileString(contractPath)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeContract))))
  const config = { ...configured, executionVersion: "native-v1" as const, projectCheck: contract.check }
  const commands = yield* makeNativeCommands
  const tracker = makeTracker(config, commands, yield* HttpClient.HttpClient)
  const git = makeGit(config, commands)
  const workflow = makeNativeWorkflow(config, contract, commands, tracker, git)
  const controller = makeNativeController(config, contract, commands, tracker)
  if (mode === "launch") {
    const instruction = yield* Config.NonEmptyString("DALPH_NATIVE_TASK")
    yield* Console.log(JSON.stringify(yield* controller.launch(instruction)))
    return
  }
  if (mode === "resume") {
    yield* controller.resume(yield* Schema.decodeUnknownEffect(BeadId)(process.argv[3]))
    return
  }
  if (mode === "check") {
    const id = yield* Config.schema(BeadId, "GC_BEAD_ID")
    yield* workflow.check(yield* tracker.bead(id))
    return
  }
  const claim = yield* workflow.claim()
  if (!claim) return
  const current = yield* tracker.bead(claim.bead_id)
  if (mode === "prepare") yield* workflow.prepare(current)
  else if (mode === "finish") {
    const session = yield* Config.schema(BeadId, "GC_SESSION_ID")
    yield* workflow.finish(current, session)
  } else {
    const attempt = yield* tracker.fact(current.id, "native_attempt", NativeAttempt)
    if (attempt) yield* Ref.set(commands.current, attempt.plan.attempt)
    yield* workflow.integrate(current)
  }
})
NodeRuntime.runMain(
  main.pipe(
    Effect.tapError((error) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* Config.schema(AbsolutePath, "DALPH_TRIAL_ROOT")
        const session = yield* Config.String("GC_SESSION_ID").pipe(Config.withDefault("operator"))
        yield* fs.writeFileString(`${root}/native-error-${session}`, String(error))
      })
    ),
    Effect.provide(Layer.merge(NodeHttpClient.layerUndici, NodeServices.layer))
  )
)
