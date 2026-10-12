import * as HttpClient from "effect/http/HttpClient"
import { Config, Console, Effect, FileSystem, Layer, Ref, Schema } from "effect"
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { configuration } from "../src/delivery/config.ts"
import { makeNativeCommands } from "../src/delivery/command.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeGit } from "../src/delivery/git.ts"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { NativeAttempt, NativeContract } from "../src/native/contract.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { makeNativeWorkflow } from "../src/native/workflow.ts"
import { makeNativeContinuation } from "../src/native/continuation.ts"
import { makeNativeReview } from "../src/native/review.ts"
import { NativeReviewVerdict } from "../src/native/review-contract.ts"
import { acknowledgeActorRetirement } from "../src/native/actor-retirement.ts"
import { runtimeHeartbeat } from "../src/native/runtime-heartbeat.ts"

const INFRASTRUCTURE_EXIT = 75

const main = Effect.gen(function* () {
  const mode = yield* Schema.decodeUnknownEffect(
    Schema.Literals([
      "launch",
      "continue",
      "resume",
      "prepare",
      "finish",
      "check",
      "integrate",
      "review-prepare",
      "finish-fix",
      "review-context",
      "review-submit",
      "review-gate",
      "qualify"
    ])
  )(process.argv[2])
  const configured = yield* configuration
  const fs = yield* FileSystem.FileSystem
  const contractPath = yield* Config.schema(AbsolutePath, "DALPH_NATIVE_CONTRACT")
  const contract = yield* fs
    .readFileString(contractPath)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeContract))))
  const projectContract = yield* Config.schema(AbsolutePath, "DALPH_PROJECT_CONTRACT_PATH")
  const config = {
    ...configured,
    contract: projectContract,
    executionVersion: "native-v1" as const,
    projectCheck: contract.check
  }
  const commands = yield* makeNativeCommands
  const tracker = makeTracker(config, commands, yield* HttpClient.HttpClient)
  const git = makeGit(config, commands)
  const workflow = makeNativeWorkflow(config, contract, commands, tracker, git)
  const controller = makeNativeController(config, contract, commands, tracker, process.execPath)
  const review = makeNativeReview(config, commands, tracker, git)
  if (mode === "launch") {
    const instruction = yield* Config.NonEmptyString("DALPH_NATIVE_TASK")
    yield* Console.log(JSON.stringify(yield* controller.launch(instruction)))
    return
  }
  if (mode === "continue") {
    const current = yield* tracker.bead(yield* Schema.decodeUnknownEffect(BeadId)(process.argv[3]))
    const key = yield* Schema.decodeUnknownEffect(Schema.String.check(Schema.isMinLength(1)))(process.argv[4])
    const continuation = makeNativeContinuation(config, contract, commands, tracker, git, process.execPath)
    yield* Console.log(JSON.stringify(yield* continuation.continuation(current, key)))
    return
  }
  if (mode === "resume") {
    yield* controller.resume(yield* Schema.decodeUnknownEffect(BeadId)(process.argv[3]))
    return
  }
  if (mode === "check" || mode === "review-gate") {
    const id = yield* Config.schema(BeadId, "GC_BEAD_ID")
    if (mode === "check") yield* workflow.check(yield* tracker.bead(id))
    else
      yield* review.gate(yield* tracker.bead(id)).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Console.error(String(error))
            process.exitCode = error._tag === "ReviewBlocking" ? 1 : INFRASTRUCTURE_EXIT
          })
        )
      )
    return
  }
  const claim = yield* workflow.claim()
  if (!claim) return
  const current = yield* tracker.bead(claim.bead_id)
  if (mode === "qualify" || mode === "integrate" || mode === "prepare")
    yield* runtimeHeartbeat(
      config,
      commands,
      yield* Config.schema(BeadId, "GC_SESSION_ID"),
      yield* Config.NonEmptyString("GC_TMUX_SESSION").pipe(
        Config.orElse(() => Config.NonEmptyString("GC_SESSION_NAME"))
      )
    )
  if (mode === "review-context") {
    const facts = yield* review.context(current)
    yield* Console.log(
      JSON.stringify({
        ...facts,
        requirements: facts.group.work.description,
        projectContract: config.contract ? yield* fs.readFileString(config.contract) : null
      })
    )
    return
  }
  if (mode === "review-prepare") {
    yield* review.prepare(current)
    return
  }
  if (mode === "finish-fix") {
    yield* review.finishFix(current, yield* Config.schema(BeadId, "GC_SESSION_ID"))
    yield* acknowledgeActorRetirement(config, commands, tracker, current.id)
    return
  }
  if (mode === "review-submit") {
    const path = yield* Schema.decodeUnknownEffect(AbsolutePath)(process.argv[3])
    const verdict = yield* fs
      .readFileString(path)
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeReviewVerdict))))
    const session = yield* Config.schema(BeadId, "GC_SESSION_ID")
    if (verdict.session !== session)
      return yield* new BoundaryFailure({ message: "review submission names another session" })
    yield* review.submit(current, verdict)
    yield* acknowledgeActorRetirement(config, commands, tracker, current.id)
    return
  }
  if (mode === "qualify") {
    yield* workflow.check(current)
    yield* tracker.metadata(current.id, "gc.outcome", "pass")
    yield* tracker.close(current.id, "Exact independent candidate qualified")
    return
  }
  if (mode === "prepare") yield* workflow.prepare(current)
  else if (mode === "finish") {
    const session = yield* Config.schema(BeadId, "GC_SESSION_ID")
    yield* workflow.finish(current, session)
    yield* acknowledgeActorRetirement(config, commands, tracker, current.id)
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
