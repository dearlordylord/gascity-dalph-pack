import type { integrationCustody } from "../native/integration-custody.ts"
import { isImplementationMetadata } from "../native/nodes.ts"
import { Effect, FileSystem, Ref, Schema } from "effect"
import { Plan, Result, type Candidate } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure, CommitSha } from "../domain/shared.ts"
import { acceptedResultMatches, candidateMatches, exactParents } from "../domain/candidate.ts"
import type { RuntimeConfig } from "./config.ts"
import type { Bead, Commands, makeTracker } from "./tracker.ts"
import { Bead as BeadSchema } from "./tracker.ts"
import type { Git } from "./git.ts"
import type { makeStages } from "./stages.ts"
import type { makeWorktrees } from "./worktrees.ts"

import { observePrerequisites } from "./tracker-eligibility.ts"
import { implementationIdentityMatches } from "./tracker-scope.ts"
import { refreshCandidate, retainedCandidate, unfinishedRefresh } from "./candidate-refresh.ts"
import { Claim, verifyClaim } from "./tracker-observation.ts"

type Tracker = ReturnType<typeof makeTracker>
type Stages = ReturnType<typeof makeStages>
type Worktrees = ReturnType<typeof makeWorktrees>
const implementationPrompt =
  "You own this exact isolated attempt. Implement the assigned task, add meaningful tests, run mise exec -- pnpm test, review against the requested behavior and code quality, fix findings and commit all owned changes. Do not push, merge, touch other worktrees, close tracker records, or launch other agents. Prerequisite delivery beads are closed. Use git -c user.name='Dalph Trial' -c user.email='dalph-trial@local' -c commit.gpgsign=false commit if needed."

export const makeWorkflow = (
  config: RuntimeConfig,
  commands: Commands,
  tracker: Tracker,
  git: Git,
  stages: Stages,
  worktrees: Worktrees,
  custody: ReturnType<typeof integrationCustody> = Effect.void,
  candidateObserved: (
    current: Bead,
    candidate: typeof Candidate.Type,
    ordinal: number
  ) => Effect.Effect<
    void,
    Effect.Error<ReturnType<typeof integrationCustody>> | Effect.Error<ReturnType<Tracker["record"]>>,
    Effect.Services<ReturnType<typeof integrationCustody>>
  > = () => Effect.void
) => {
  const fetch = () => git.git(["fetch", "origin", `${git.target}:${git.remote}`])
  const commitAt = (ref: string, cwd = config.repo) =>
    git.git(["rev-parse", ref], cwd).pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitSha)))
  const accept = Effect.fn("Delivery.accept")(function* (current: Bead, plan: typeof Plan.Type, close = true) {
    if (yield* git.git(["status", "--porcelain"], plan.path))
      return yield* new BoundaryFailure({ message: "accepted implementation must be committed and clean" })
    const result = yield* commitAt("HEAD", plan.path)
    if (result === plan.base) return yield* new BoundaryFailure({ message: "implementation produced no commit" })
    yield* git.git(["merge-base", "--is-ancestor", plan.base, result])
    const tests = yield* stages.qualify(current.id, plan)
    yield* tracker.record(current.id, "result", { commit: result, attempt: plan.attempt, tests })
    if (close) yield* tracker.close(current.id, "Accepted implementation result; task delivery remains open")
  })
  const worker = Effect.fn("Delivery.worker")(function* (current: Bead) {
    const retained = yield* tracker.fact(current.id, "work_plan", Plan)
    if (!retained) yield* fetch()
    const base = retained?.base ?? (yield* commitAt(git.remote))
    const plan = yield* worktrees.prepare(current.id, "work", base)
    let prompt = `${current.description}\n\n${implementationPrompt}`
    if (config.contract) {
      const fs = yield* FileSystem.FileSystem
      prompt += `\n\nProject contract:\n${yield* fs.readFileString(config.contract)}`
    }
    yield* stages.model(current.id, plan, prompt)
    yield* accept(current, plan)
  })
  const matchesNativeIdentity = (delivery: Bead["metadata"], metadata: Bead["metadata"]) => {
    if (!delivery || !metadata) return false
    const product = delivery["dalph.product_root"] || delivery["gc.root_bead_id"]
    return (
      isImplementationMetadata(metadata) &&
      metadata["dalph.task"] === delivery["dalph.task"] &&
      metadata["gc.root_bead_id"] === product
    )
  }
  const implementationFor = Effect.fn("Delivery.implementationFor")(function* (current: Bead) {
    const rows = yield* commands
      .execute(config.root, [...tracker.gc, "ready", "--status", "closed", "--limit", "0", "--json"])
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(BeadSchema)))))
    const matchesIdentity = (metadata: Bead["metadata"]) =>
      config.executionVersion === "native-v1"
        ? matchesNativeIdentity(current.metadata, metadata)
        : implementationIdentityMatches(current.metadata, metadata)
    const matches = rows.filter((row) => matchesIdentity(row.metadata))
    if (matches.length !== 1 || !matches[0])
      return yield* new BoundaryFailure({ message: "delivery needs one exact closed implementation result" })
    const source = yield* tracker.bead(matches[0].id)
    if (source.status !== "closed" || !matchesIdentity(source.metadata))
      return yield* new BoundaryFailure({ message: "implementation result has foreign or unfinished native scope" })
    return source
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
  const PushIntent = Schema.Struct({
    candidate: CommitSha,
    head: CommitSha,
    endpoint: Schema.String,
    ref: Schema.String
  })
  const publicationEndpoint = Effect.fn("Delivery.publicationEndpoint")(function* (
    id: BeadId,
    candidate: typeof Candidate.Type,
    ordinal: number
  ) {
    const endpoint = yield* git.git(["remote", "get-url", "--push", "origin"])
    const pinned = yield* tracker.fact(id, "push_intent", PushIntent)
    if (pinned && (pinned.endpoint !== endpoint || pinned.ref !== git.target))
      return yield* new BoundaryFailure({ message: "publication endpoint changed; preserve pinned candidate" })
    const key = ordinal === 1 ? "push_intent" : `push_intent_${ordinal}`
    yield* tracker.record(id, key, { candidate: candidate.commit, head: candidate.head, endpoint, ref: git.target })
    return endpoint
  })
  const pushCandidate = Effect.fn("Delivery.pushCandidate")(function* (
    id: BeadId,
    candidate: typeof Candidate.Type,
    endpoint: string
  ) {
    const plan = yield* tracker.fact(id, "candidate_plan", Plan)
    if (!plan) return yield* new BoundaryFailure({ message: "candidate lost its exact plan" })
    yield* stages.qualifiedTree(plan, candidate.commit)
    yield* git.git(["push", endpoint, `${candidate.commit}:${git.target}`])
    if (config.faultAfterPush === id)
      return yield* new BoundaryFailure({ message: "injected loss after push; intent retained" })
  })
  const publish = Effect.fn("Delivery.publish")(function* (id: BeadId, candidate: typeof Candidate.Type, ordinal = 1) {
    const endpoint = yield* publicationEndpoint(id, candidate, ordinal)
    yield* git.git(["fetch", endpoint, `${git.target}:${git.remote}`])
    let remote = yield* commitAt(git.remote)
    if (config.executionVersion === "native-v1" && remote !== candidate.head) {
      const applied = yield* git.git(["merge-base", "--is-ancestor", candidate.commit, remote]).pipe(
        Effect.as(true),
        Effect.catchTag("CommandRejected", (error) => (error.exit === 1 ? Effect.succeed(false) : Effect.fail(error)))
      )
      if (!applied) return { refresh: remote }
    }
    if (remote === candidate.head) {
      yield* pushCandidate(id, candidate, endpoint)
      yield* git.git(["fetch", endpoint, `${git.target}:${git.remote}`])
      remote = yield* commitAt(git.remote)
    }
    yield* git.git(["merge-base", "--is-ancestor", candidate.commit, remote])
    yield* tracker.record(id, "published", { commit: candidate.commit })
    return { refresh: null }
  })
  const promote = Effect.fn("Delivery.promote")(function* (id: BeadId, candidate: typeof Candidate.Type) {
    yield* tracker.record(id, "promotion_intent", { head: candidate.head, candidate: candidate.commit })
    yield* git.guarded(
      Effect.gen(function* () {
        if ((yield* git.git(["symbolic-ref", "-q", "HEAD"])) !== git.target)
          return yield* new BoundaryFailure({ message: "target checkout is on a different branch; promotion refused" })
        const local = yield* commitAt(git.target)
        const plan = yield* tracker.fact(id, "candidate_plan", Plan)
        if (local === candidate.head || local === plan?.base) {
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
    yield* custody
    const source = yield* implementationFor(current)
    const result = yield* tracker.fact(source.id, "result", Result)
    if (!result) return yield* new BoundaryFailure({ message: "missing exact accepted result" })
    const sourcePlan = yield* tracker.fact(source.id, "work_plan", Plan)
    if (!acceptedResultMatches(sourcePlan, result))
      return yield* new BoundaryFailure({ message: "accepted result changed its attempt or qualification" })
    const retained = yield* retainedCandidate(tracker, current.id)
    let candidate = retained.candidate
    let ordinal = retained.ordinal
    if (candidate) {
      const plan = yield* tracker.fact(current.id, "candidate_plan", Plan)
      if (!plan) return yield* new BoundaryFailure({ message: "candidate has no retained plan" })
      yield* Ref.set(commands.current, plan.attempt)
      yield* commands.reconcile(config.root, plan.attempt)
    } else candidate = yield* constructCandidate(current.id, result)
    if (!candidateMatches(candidate, result))
      return yield* new BoundaryFailure({ message: "candidate or approval differs from accepted result" })
    const unfinished = yield* unfinishedRefresh(tracker, current.id, ordinal)
    if (unfinished) {
      candidate = yield* refreshCandidate(tracker, git, stages, current.id, candidate, result, unfinished.head, ordinal)
      ordinal++
    }
    yield* candidateObserved(current, candidate, ordinal)
    let publication = yield* publish(current.id, candidate, ordinal)
    while (publication.refresh) {
      candidate = yield* refreshCandidate(
        tracker,
        git,
        stages,
        current.id,
        candidate,
        result,
        publication.refresh,
        ordinal
      )
      ordinal++
      yield* candidateObserved(current, candidate, ordinal)
      publication = yield* publish(current.id, candidate, ordinal)
    }
    yield* promote(current.id, candidate)
    yield* worktrees.cleanup(current.id, source.id, "work")
    yield* worktrees.cleanup(current.id, current.id, "candidate")
    yield* tracker.close(current.id, "Exact result integrated, remote verified, promoted and owned resources cleaned")
  })
  const requireLegacy = (bead: Bead) =>
    bead.metadata?.["dalph.runtime"] === "native-v1"
      ? Effect.fail(new BoundaryFailure({ message: "legacy-v1 runtime cannot execute a native-v1 workflow" }))
      : Effect.void
  const discoverLegacy = Effect.fn("Delivery.discoverLegacy")(function* () {
    const discovered = yield* commands.execute(config.root, [...tracker.gc, "hook", "--json"]).pipe(
      Effect.catchTag("CommandRejected", (error) =>
        Effect.gen(function* () {
          if (error.exit !== 1) return yield* Effect.fail(error)
          const fs = yield* FileSystem.FileSystem
          const source = yield* fs.readFileString(error.receipt.replace(/\.json$/, ".stdout"))
          const rows = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(BeadSchema)))(source)
          if (rows.length !== 0) return yield* Effect.fail(error)
          return source
        })
      ),
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Union([
              Schema.Struct({ action: Schema.Literal("work"), bead_id: BeadId }),
              Claim,
              Schema.Array(BeadSchema)
            ])
          )
        )
      )
    )
    const discoveredId =
      "action" in discovered ? (discovered.action === "work" ? discovered.bead_id : undefined) : discovered[0]?.id
    if (discoveredId) yield* requireLegacy(yield* tracker.bead(discoveredId))
  })
  const run = Effect.fn("Delivery.turn")(function* (role: "worker" | "integrator") {
    yield* discoverLegacy()
    yield* commands.reconcile(config.root, null, true)
    const claim = yield* tracker.claim()
    if (claim.action === "drain") return { outcome: "idle" as const, reason: claim.reason }
    const current = yield* tracker.bead(claim.bead_id)
    yield* verifyClaim(config, claim, current, role)
    yield* requireLegacy(current)
    const phase = role === "worker" ? "work" : "deliver"
    if (current.metadata?.["dalph.phase"] !== phase)
      return yield* new BoundaryFailure({ message: "claimed bead belongs to a different workflow phase" })
    if (current.status === "closed") return { outcome: "settled" as const }
    if (!current.description) return yield* new BoundaryFailure({ message: "claimed task has no instructions" })
    yield* observePrerequisites(current, tracker.bead)
    if (role === "worker") {
      yield* worker(current)
      return { outcome: "worked" as const }
    }
    yield* git.integrating(integrator(current))
    return { outcome: "delivered" as const }
  })
  const serializedIntegrator = (current: Bead) => git.integrating(integrator(current))
  return { run, accept, integrator: serializedIntegrator }
}
