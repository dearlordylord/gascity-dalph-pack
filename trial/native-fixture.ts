import * as HttpClient from "effect/http/HttpClient"
import { Config, Effect, FileSystem, Layer, Schema } from "effect"
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { configuration } from "../src/delivery/config.ts"
import { makeNativeCommands } from "../src/delivery/command.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeGit } from "../src/delivery/git.ts"
import { makeNativeWorkflow } from "../src/native/workflow.ts"
import { makeNativeReview } from "../src/native/review.ts"
import { NativeAttempt, NativeContract } from "../src/native/contract.ts"
import { acknowledgeActorRetirement } from "../src/native/actor-retirement.ts"
import { nativeGroup } from "../src/native/identity.ts"
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
  const commands = yield* makeNativeCommands
  const tracker = makeTracker(config, commands, yield* HttpClient.HttpClient)
  const git = makeGit(config, commands)
  const workflow = makeNativeWorkflow(config, contract, commands, tracker, git)
  const review = makeNativeReview(config, commands, tracker, git)
  yield* Effect.sleep("3 seconds")
  const claim = yield* workflow.claim()
  if (!claim) return
  const work = yield* tracker.bead(claim.bead_id)
  const group = yield* nativeGroup(config, commands, work)
  const attempt = yield* tracker.fact(group.work.id, "native_attempt", NativeAttempt)
  if (!attempt) return yield* new BoundaryFailure({ message: `fixture claimed ${work.id} without its native attempt` })
  const actualWorkspace = yield* fs.realPath(".")
  const plannedWorkspace = yield* fs.realPath(attempt.plan.path)
  if (actualWorkspace !== plannedWorkspace)
    return yield* new BoundaryFailure({
      message: `fixture ${work.id} started in ${actualWorkspace}; expected ${plannedWorkspace}`
    })
  yield* fs.writeFileString(`${config.root}/native-started-${work.id}`, JSON.stringify({ session, attempt }))
  const fault = yield* Config.String("DALPH_NATIVE_FIXTURE_FAULT").pipe(Config.withDefault("none"))
  const reviewFault = yield* Config.String("DALPH_NATIVE_REVIEW_FIXTURE").pipe(Config.withDefault("clean"))
  if (work.metadata?.["dalph.phase"] === "review") {
    const facts = yield* review.context(work)
    const cleanHumanBatch = facts.batch !== "initial" && (yield* fs.exists(`${config.root}/native-human-clean`))
    if (reviewFault !== "transport") {
      if (reviewFault === "malformed") {
        yield* tracker.metadata(work.id, `dalph.native_review_initial_${facts.round}`, "{malformed")
        yield* tracker.close(work.id, "Malformed controlled review retained")
      } else {
        yield* review.submit(work, {
          version: 1,
          node: work.id,
          session,
          round: facts.round,
          batch: facts.batch,
          attempt: attempt.plan.attempt,
          task: attempt.task,
          base: attempt.plan.base,
          commit: facts.commit,
          basis: { requirements: true, projectContract: true, baseToCandidate: true },
          findings:
            !cleanHumanBatch && (reviewFault === "blocking" || (reviewFault === "converge" && facts.round === 1))
              ? [{ id: "fixture-blocker", message: "Add the native review repair marker", disposition: "blocking" }]
              : []
        })
      }
    } else {
      yield* tracker.metadata(work.id, "gc.outcome", "fail")
      yield* tracker.metadata(work.id, "gc.failure_class", "transient")
      yield* tracker.close(work.id, "Controlled reviewer transport failed without a semantic verdict")
    }

    if (["transport", "malformed"].includes(reviewFault)) return
    yield* acknowledgeActorRetirement(config, commands, tracker, work.id)
    return
  }
  if (work.metadata?.["dalph.phase"] === "fix") {
    const facts = yield* review.context(work)
    yield* fs.writeFileString(`${attempt.plan.path}/native-review-fixed.ts`, `export const repaired = ${facts.round}\n`)
    yield* git.git(["add", "native-review-fixed.ts"], attempt.plan.path)
    const changed = yield* git.git(["diff", "--cached", "--quiet"], attempt.plan.path).pipe(
      Effect.as(false),
      Effect.catchTag("CommandRejected", (error) => (error.exit === 1 ? Effect.succeed(true) : Effect.fail(error)))
    )
    if (changed)
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
          "native review fixes"
        ],
        attempt.plan.path
      )
    yield* review.finishFix(work, session)
    yield* acknowledgeActorRetirement(config, commands, tracker, work.id)
    return
  }
  if (fault === "hold") yield* Effect.sleep("90 seconds")
  if (fault === "missing") return
  const distinct = yield* Config.Boolean("DALPH_NATIVE_FIXTURE_DISTINCT").pipe(Config.withDefault(false))
  const filename = distinct ? `native-proof-${work.id}.ts` : "native-proof.ts"
  yield* fs.writeFileString(`${attempt.plan.path}/${filename}`, 'export const delivered = "native"\n')
  yield* git.git(["add", filename], attempt.plan.path)
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
  yield* acknowledgeActorRetirement(config, commands, tracker, work.id)
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
