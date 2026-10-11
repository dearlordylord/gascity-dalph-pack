import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { Effect, FileSystem, Ref, Schema } from "effect"
import { Plan, Prepared, Publication, Result, Candidate, CommandIntent } from "../domain/attempt.ts"
import { AttemptId, type BeadId, BirthTicks, BoundaryFailure, type CommitSha } from "../domain/shared.ts"
import { authorizeCleanup, worktreeAction } from "../domain/protocol.ts"
import type { RuntimeConfig } from "./config.ts"
import type { Commands, makeTracker } from "./tracker.ts"
import type { Git } from "./git.ts"
import { markedProcesses } from "./process-observation.ts"

type Tracker = ReturnType<typeof makeTracker>
export const makeWorktrees = (config: RuntimeConfig, commands: Commands, tracker: Tracker, git: Git) => {
  const spec = (plan: Plan) => [
    "--repo",
    config.repo,
    "--root",
    config.worktrees,
    "--path",
    plan.path,
    "--branch",
    plan.branch,
    "--base",
    git.remote,
    "--base-sha",
    plan.base,
    "--bead",
    plan.bead,
    "--store-ref",
    `rig:${config.rig}`,
    "--creator",
    "dalph-pack",
    "--owner",
    plan.attempt,
    "--generation",
    "1",
    "--json"
  ]
  const prepare = Effect.fn("Worktree.prepare")(function* (id: BeadId, kind: "work" | "candidate", base: CommitSha) {
    return yield* git.guarded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        let plan = yield* tracker.fact(id, `${kind}_plan`, Plan)
        if (!plan) {
          const attempt = yield* Effect.sync(() => AttemptId.make(randomUUID().replaceAll("-", "")))
          plan = yield* Schema.decodeUnknownEffect(Plan)({
            bead: id,
            attempt,
            base,
            branch: `dalph/${kind}/${id}`,
            path: join(config.worktrees, `${kind}-${id}`)
          })
          yield* Ref.set(commands.current, plan.attempt)
          yield* tracker.record(id, `${kind}_plan`, plan)
        }
        yield* Ref.set(commands.current, plan.attempt)
        yield* commands.reconcile(config.root, plan.attempt)
        const ready = yield* tracker.fact(id, `${kind}_prepared`, Prepared)
        const action = yield* worktreeAction(ready !== null, yield* fs.exists(plan.path))
        if (action === "ensure" && (yield* git.git(["rev-parse", git.remote])) !== plan.base)
          return yield* new BoundaryFailure({
            message: "declared attempt Base no longer matches preparation ref; retain plan"
          })
        yield* tracker.record(id, `${kind}_prepare_intent`, { plan })
        const report = yield* commands
          .execute(config.root, ["gc", "worktree", action, ...spec(plan)])
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.JsonObject))))
        const prepared = yield* Schema.decodeUnknownEffect(Prepared)(report)
        if (ready && prepared.provenance.attempt_id !== ready.provenance.attempt_id)
          return yield* new BoundaryFailure({ message: "worktree provisioning attempt changed" })
        if (!ready) yield* tracker.record(id, `${kind}_prepared`, report)
        return plan
      })
    )
  })
  const birthFor = Effect.fn("Worktree.cleanupBirth")(function* (source: BeadId) {
    const births: BirthTicks[] = []
    for (const stage of ["model", "qualification"]) {
      for (const suffix of ["", "_2", "_3"]) {
        const intent = yield* tracker.fact(source, `${stage}${suffix}_intent`, CommandIntent)
        if (intent) births.push(intent.birth_ticks)
      }
    }
    if (!births.length)
      return yield* new BoundaryFailure({ message: "cleanup has no stopped-writer qualification boundary" })
    return BirthTicks.make(Math.min(...births))
  })
  const cleanBranch = Effect.fn("Worktree.cleanBranch")(function* (
    source: BeadId,
    kind: "work" | "candidate",
    plan: Plan
  ) {
    const exists = yield* git.git(["show-ref", "--verify", "--quiet", `refs/heads/${plan.branch}`]).pipe(
      Effect.as(true),
      Effect.catchTag("CommandRejected", (error) => (error.exit === 1 ? Effect.succeed(false) : Effect.fail(error)))
    )
    if (!exists) return
    const tip = yield* git.git(["rev-parse", "--verify", `refs/heads/${plan.branch}`])
    const result =
      kind === "work"
        ? yield* tracker.fact(source, "result", Result)
        : yield* tracker.fact(source, "candidate", Candidate)
    if (!result || tip !== result.commit)
      return yield* new BoundaryFailure({ message: "owned branch moved; cleanup preserves it" })
    yield* git.git(["update-ref", "-d", `refs/heads/${plan.branch}`, result.commit])
  })
  const cleanup = Effect.fn("Worktree.cleanup")(function* (
    delivery: BeadId,
    source: BeadId,
    kind: "work" | "candidate"
  ) {
    const plan = yield* tracker.fact(source, `${kind}_plan`, Plan)
    const prepared = yield* tracker.fact(source, `${kind}_prepared`, Prepared)
    if (!plan || !prepared) return yield* new BoundaryFailure({ message: "cleanup has no exact prepared plan" })
    yield* commands.reconcile(config.root, plan.attempt)
    const published = yield* tracker.fact(delivery, "published", Publication)
    const birth = yield* birthFor(source)
    const writers = yield* markedProcesses(`DALPH_ATTEMPT=${plan.attempt}`, birth, commands.owner)
    yield* authorizeCleanup(published !== null, writers.length === 0)
    yield* tracker.record(delivery, `${kind}_cleanup_intent`, { plan, attempt_id: prepared.provenance.attempt_id })
    const report = yield* commands
      .execute(config.root, [
        "gc",
        "worktree",
        "cleanup",
        ...spec(plan),
        "--attempt-id",
        prepared.provenance.attempt_id
      ])
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Struct({ cleanup_pending: Schema.optionalKey(Schema.Boolean) }))
          )
        )
      )
    if (report.cleanup_pending) return yield* new BoundaryFailure({ message: "safe cleanup refused; retain resources" })
    yield* tracker.record(delivery, `${kind}_cleaned`, { path: plan.path, attempt: plan.attempt })
    yield* cleanBranch(source, kind, plan)
  })
  return { prepare, cleanup }
}
