import * as HttpClient from "effect/http/HttpClient"
import { Config, Effect, FileSystem, Layer, Ref, Schedule, Schema } from "effect"
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { configuration } from "../src/delivery/config.ts"
import { CommandRejected, makeNativeCommands } from "../src/delivery/command.ts"
import { makeTracker, type Commands } from "../src/delivery/tracker.ts"
import { makeGit } from "../src/delivery/git.ts"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { NativeAttempt, NativeContract } from "../src/native/contract.ts"
import { makeNativeWorkflow } from "../src/native/workflow.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { runtimeHeartbeat } from "../src/native/runtime-heartbeat.ts"

// Fault ports belong exclusively to the isolated acceptance provider.
const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const settings = yield* configuration
  const path = yield* Config.schema(AbsolutePath, "DALPH_NATIVE_CONTRACT")
  const contract = yield* fs
    .readFileString(path)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeContract))))
  const config = { ...settings, executionVersion: "native-v1" as const, projectCheck: contract.check }
  const actual = yield* makeNativeCommands
  const wait = (name: string) =>
    fs.exists(`${config.root}/release-${name}`).pipe(
      Effect.flatMap((released) =>
        released ? Effect.void : Effect.fail(new BoundaryFailure({ message: `${name} barrier pending` }))
      ),
      Effect.retry({
        schedule: Schedule.spaced("100 millis").pipe(
          Schedule.upTo({ duration: name === "integration" ? "10 minutes" : "90 seconds" })
        )
      })
    )
  const commands: Commands = {
    ...actual,
    execute: (root, args, cwd, timeout, logs) =>
      Effect.gen(function* () {
        const name =
          args[0] === "git" && args.includes("push")
            ? "push"
            : args[0] === "gc" && args[1] === "worktree" && args[2] === "cleanup"
              ? "cleanup"
              : null
        const text = yield* actual.execute(root, args, cwd, timeout, logs)
        if (name) {
          yield* fs.writeFileString(
            `${root}/delivery-trace.jsonl`,
            `${JSON.stringify({ name, args, attempt: yield* Ref.get(actual.current) })}\n`,
            { flag: "a" }
          )
          const marker = `${root}/${name}-applied`
          if (!(yield* fs.exists(marker))) {
            yield* fs.writeFileString(marker, JSON.stringify({ args, attempt: yield* Ref.get(actual.current) }))
            yield* wait(name)
            return yield* new CommandRejected({
              message: `deterministic lost ${name} response`,
              receipt: `${root}/lost-${name}`
            })
          }
        }
        return text
      })
  }
  yield* runtimeHeartbeat(
    config,
    commands,
    yield* Config.schema(BeadId, "GC_SESSION_ID"),
    yield* Config.NonEmptyString("GC_TMUX_SESSION").pipe(Config.orElse(() => Config.NonEmptyString("GC_SESSION_NAME")))
  )
  yield* wait("integration")
  const tracker = makeTracker(config, commands, yield* HttpClient.HttpClient)
  const git = makeGit(config, commands)
  const workflow = makeNativeWorkflow(config, contract, commands, tracker, git)
  const claim = yield* workflow.claim()
  if (!claim) return
  const current = yield* tracker.bead(claim.bead_id)
  const attempt = yield* tracker.fact(current.id, "native_attempt", NativeAttempt)
  if (attempt) yield* Ref.set(commands.current, attempt.plan.attempt)
  yield* workflow.integrate(current)
})
NodeRuntime.runMain(main.pipe(Effect.provide(Layer.merge(NodeHttpClient.layerUndici, NodeServices.layer))))
