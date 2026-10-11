import * as HttpClient from "effect/http/HttpClient"
import { Config, Effect, FileSystem, Layer, Schema } from "effect"
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { configuration } from "../src/delivery/config.ts"
import { makeCommands } from "../src/delivery/command.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeGit } from "../src/delivery/git.ts"
import { makeNativeWorkflow } from "../src/native/workflow.ts"
import { NativeAttempt, NativeContract } from "../src/native/contract.ts"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"

// A controlled native provider, launched directly by Gas City. It never launches an agent CLI.
const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const settings = yield* configuration
  const contractPath = yield* Config.schema(AbsolutePath, "DALPH_NATIVE_CONTRACT")
  const contract = yield* fs
    .readFileString(contractPath)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeContract))))
  const config = { ...settings, executionVersion: "native-v1" as const, projectCheck: contract.check }
  const session = yield* Config.schema(BeadId, "GC_SESSION_ID")
  const commands = yield* makeCommands
  const tracker = makeTracker(config, commands, yield* HttpClient.HttpClient)
  const git = makeGit(config, commands)
  const workflow = makeNativeWorkflow(config, contract, commands, tracker, git)
  yield* Effect.sleep("3 seconds")
  const claim = yield* workflow.claim()
  if (!claim) return
  const work = yield* tracker.bead(claim.bead_id)
  const attempt = yield* tracker.fact(work.id, "native_attempt", NativeAttempt)
  if (!attempt || (yield* fs.realPath(".")) !== (yield* fs.realPath(attempt.plan.path)))
    return yield* new BoundaryFailure({ message: "fixture did not start in its exact native attempt worktree" })
  yield* fs.writeFileString(`${config.root}/native-started-${work.id}`, JSON.stringify({ session, attempt }))
  const fault = yield* Config.String("DALPH_NATIVE_FIXTURE_FAULT").pipe(Config.withDefault("none"))
  if (fault === "hold") yield* Effect.sleep("90 seconds")
  if (fault === "missing") return
  yield* fs.writeFileString(`${attempt.plan.path}/native-proof.ts`, 'export const delivered = "native"\n')
  yield* git.git(["add", "native-proof.ts"], attempt.plan.path)
  yield* git.git(
    [
      "-c",
      "user.name=Native Fixture",
      "-c",
      "user.email=native@local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "native fixture implementation"
    ],
    attempt.plan.path
  )
  yield* workflow.finish(work, session)
  yield* commands.execute(config.root, [...tracker.gc, "session", "close", session, "--json"])
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
