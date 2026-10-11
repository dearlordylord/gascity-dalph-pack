import { Duration, Effect, FileSystem, Ref, Schema } from "effect"
import { Plan, Result, Candidate } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure, CommitSha } from "../domain/shared.ts"
import { exactParents } from "../domain/candidate.ts"
import type { RuntimeConfig } from "./config.ts"
import type { Bead, Commands, makeTracker } from "./tracker.ts"
import { Bead as BeadSchema } from "./tracker.ts"
import type { Git } from "./git.ts"
import type { makeStages } from "./stages.ts"
import type { makeWorktrees } from "./worktrees.ts"

type Tracker = ReturnType<typeof makeTracker>
type Stages = ReturnType<typeof makeStages>
type Worktrees = ReturnType<typeof makeWorktrees>
const CLAIM_SECONDS = 120
const implementationPrompt =
  "You own this exact isolated attempt. Implement the assigned task, add meaningful tests, run mise exec -- pnpm test, review against the requested behavior and code quality, fix findings and commit all owned changes. Do not push, merge, touch other worktrees, close tracker records, or launch other agents. Prerequisite delivery beads are closed. Use git -c user.name='Dalph Trial' -c user.email='dalph-trial@local' -c commit.gpgsign=false commit if needed."

export const makeWorkflow = (
  config: RuntimeConfig,
  commands: Commands,
  tracker: Tracker,
  git: Git,
  stages: Stages,
  worktrees: Worktrees
) => {
  const fetch = () => git.git(["fetch", "origin", `${git.target}:${git.remote}`])
  const commitAt = (ref: string, cwd = config.repo) =>
    git.git(["rev-parse", ref], cwd).pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitSha)))
  const worker = Effect.fn("Delivery.worker")(function* (current: Bead) {
    const retained = yield* tracker.fact(current.id, "work_plan", Plan)
    if (!retained) yield* fetch()
    const base = retained?.base ?? (yield* commitAt(git.remote))
    const plan = yield* worktrees.prepare(current.id, "work", base)
    if (!current.description)
      return yield* new BoundaryFailure({ message: "work bead has no implementation instructions" })
    let prompt = `${current.description}\n\n${implementationPrompt}`
    if (config.contract) {
      const fs = yield* FileSystem.FileSystem
      prompt += `\n\nProject contract:\n${yield* fs.readFileString(config.contract)}`
    }
    yield* stages.model(current.id, plan, prompt)
    if (yield* git.git(["status", "--porcelain"], plan.path))
      return yield* new BoundaryFailure({ message: "accepted implementation must be committed and clean" })
    const result = yield* commitAt("HEAD", plan.path)
    if (result === plan.base) return yield* new BoundaryFailure({ message: "implementation produced no commit" })
    yield* git.git(["merge-base", "--is-ancestor", plan.base, result])
    const tests = yield* stages.qualify(current.id, plan)
    yield* tracker.record(current.id, "result", { commit: result, attempt: plan.attempt, tests })
    yield* tracker.close(current.id, "Accepted implementation result; task delivery remains open")
  })
  const implementationFor = Effect.fn("Delivery.implementationFor")(function* (current: Bead) {
    const task = current.metadata?.["dalph.task"]
    const root = current.metadata?.["gc.root_bead_id"]
    if (!task || !root) return yield* new BoundaryFailure({ message: "delivery has no tracker task/root identity" })
    const rows = yield* commands
      .execute(config.root, [...tracker.gc, "ready", "--status", "closed", "--limit", "0", "--json"])
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(BeadSchema)))))
    const matches = rows.filter(
      (row) =>
        row.metadata?.["dalph.task"] === task &&
        row.metadata?.["dalph.phase"] === "work" &&
        row.metadata?.["gc.root_bead_id"] === root
    )
    if (matches.length !== 1 || !matches[0])
      return yield* new BoundaryFailure({ message: "delivery needs one exact closed implementation result" })
    return matches[0]
  })
  const constructCandidate = Effect.fn("Delivery.constructCandidate")(function* (
    id: BeadId,
    result: typeof Result.Type
  ) {
    yield* fetch()
    const plan = yield* worktrees.prepare(id, "candidate", yield* commitAt(git.remote))
    yield* tracker.record(id, "merge_intent", { head: plan.base, result: result.commit, plan })
    let commit = yield* commitAt("HEAD", plan.path)
    if (commit === plan.base) {
      yield* git.git(
        [
          "-c",
          "user.name=Dalph Trial",
          "-c",
          "user.email=dalph-trial@local",
          "-c",
          "commit.gpgsign=false",
          "merge",
          "--no-ff",
          "--no-edit",
          result.commit
        ],
        plan.path
      )
      commit = yield* commitAt("HEAD", plan.path)
    }
    const parents = (yield* git.git(["show", "-s", "--format=%P", commit])).split(" ")
    if (!exactParents(parents, plan.base, result.commit))
      return yield* new BoundaryFailure({ message: "candidate must have exact ordered parents [target, result]" })
    const tests = yield* stages.qualify(id, plan)
    const candidate = { commit, head: plan.base, result: result.commit, tests }
    yield* tracker.record(id, "candidate", candidate)
    return candidate
  })
  const publish = Effect.fn("Delivery.publish")(function* (id: BeadId, candidate: typeof Candidate.Type) {
    yield* tracker.record(id, "push_intent", {
      candidate: candidate.commit,
      head: candidate.head,
      endpoint: yield* git.git(["remote", "get-url", "origin"]),
      ref: git.target
    })
    yield* fetch()
    let remote = yield* commitAt(git.remote)
    if (remote === candidate.head) {
      const plan = yield* tracker.fact(id, "candidate_plan", Plan)
      if (!plan) return yield* new BoundaryFailure({ message: "candidate lost its exact plan" })
      yield* stages.qualifiedTree(plan, candidate.commit)
      yield* git.git(["push", "origin", `${candidate.commit}:${git.target}`])
      if (config.faultAfterPush === id)
        return yield* new BoundaryFailure({ message: "injected loss after push; intent retained" })
      yield* fetch()
      remote = yield* commitAt(git.remote)
    }
    yield* git.git(["merge-base", "--is-ancestor", candidate.commit, remote])
    yield* tracker.record(id, "published", { commit: candidate.commit })
  })
  const promote = Effect.fn("Delivery.promote")(function* (id: BeadId, candidate: typeof Candidate.Type) {
    yield* tracker.record(id, "promotion_intent", { head: candidate.head, candidate: candidate.commit })
    yield* git.guarded(
      Effect.gen(function* () {
        if ((yield* git.git(["symbolic-ref", "-q", "HEAD"])) !== git.target)
          return yield* new BoundaryFailure({ message: "target checkout is on a different branch; promotion refused" })
        const local = yield* commitAt(git.target)
        if (local === candidate.head) {
          if (yield* git.git(["status", "--porcelain"]))
            return yield* new BoundaryFailure({ message: "target checkout dirty; promotion refused" })
          yield* git.git(["merge", "--ff-only", candidate.commit])
        }
      })
    )
    yield* git.git(["merge-base", "--is-ancestor", candidate.commit, git.target])
    yield* tracker.record(id, "promoted", { commit: candidate.commit })
  })
  const integrator = Effect.fn("Delivery.integrator")(function* (current: Bead) {
    const source = yield* implementationFor(current)
    const result = yield* tracker.fact(source.id, "result", Result)
    if (!result) return yield* new BoundaryFailure({ message: "missing exact accepted result" })
    let candidate = yield* tracker.fact(current.id, "candidate", Candidate)
    if (candidate) {
      const plan = yield* tracker.fact(current.id, "candidate_plan", Plan)
      if (!plan) return yield* new BoundaryFailure({ message: "candidate has no retained plan" })
      yield* Ref.set(commands.current, plan.attempt)
      yield* commands.reconcile(config.root, plan.attempt)
    } else candidate = yield* constructCandidate(current.id, result)
    const decoded = yield* Schema.decodeUnknownEffect(Candidate)(candidate)
    yield* publish(current.id, decoded)
    yield* promote(current.id, decoded)
    yield* worktrees.cleanup(current.id, source.id, "work")
    yield* worktrees.cleanup(current.id, current.id, "candidate")
    yield* tracker.close(current.id, "Exact result integrated, remote verified, promoted and owned resources cleaned")
  })
  const run = Effect.fn("Delivery.turn")(function* (role: "worker" | "integrator") {
    yield* commands.reconcile(config.root, null, true)
    const claim = yield* commands
      .execute(config.root, [...tracker.gc, "hook", "--claim", "--json"], undefined, Duration.seconds(CLAIM_SECONDS))
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Struct({ action: Schema.Literal("work"), bead_id: BeadId }))
          )
        )
      )
    const current = yield* tracker.bead(claim.bead_id)
    const phase = role === "worker" ? "work" : "deliver"
    if (current.metadata?.["dalph.phase"] !== phase)
      return yield* new BoundaryFailure({ message: "claimed bead belongs to a different workflow phase" })
    if (role === "worker") yield* worker(current)
    else yield* integrator(current)
  })
  return { run }
}
