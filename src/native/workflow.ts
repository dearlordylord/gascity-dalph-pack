import { Effect, FileSystem, Ref, Schema } from "effect"
import { BoundaryFailure, CommitSha, type BeadId } from "../domain/shared.ts"
import { canonical } from "../delivery/files.ts"
import { type Candidate, Plan, Prepared, Result } from "../domain/attempt.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands, Bead, makeTracker } from "../delivery/tracker.ts"
import type { Git } from "../delivery/git.ts"
import { makeWorktrees } from "../delivery/worktrees.ts"
import { makeStages } from "../delivery/stages.ts"
import { makeWorkflow } from "../delivery/workflow.ts"
import { NativeAttempt, NativeProposal, type NativeContract } from "./contract.ts"
import { integrationCustody } from "./integration-custody.ts"
import { nativeClaim } from "./claim.ts"
import { nativePreflight } from "./preflight.ts"
import { bindNativeAttempt, nativeGroup, publishNativeWorkspace } from "./identity.ts"
import { correlatedSession, stoppedNativeSession } from "./session.ts"
import { NativeReviewVerdict } from "./review-contract.ts"
import { reviewBatch } from "./review-correlation.ts"
import { reviewWritersStopped } from "./review-writers.ts"
import { publishSharedWorkspace } from "./shared-workspace.ts"
import { isCandidateFactMetadata, isExecutionMetadata } from "./nodes.ts"
import { reviewFactKey } from "./review-fact-key.ts"
import { cleanupMayResume } from "./cleanup-resumption.ts"
import { retainedFact } from "./retained-fact.ts"

type Tracker = ReturnType<typeof makeTracker>
export const makeNativeWorkflow = (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: Tracker,
  git: Git
) => {
  const configured = { ...config, projectCheck: contract.check }
  const worktrees = makeWorktrees(configured, commands, tracker, git)
  const stages = makeStages(configured, commands, tracker, git)
  const delivery = makeWorkflow(
    configured,
    commands,
    {
      ...tracker,
      close: Effect.fn("Native.deliveryCompleted")(function* (id, reason) {
        yield* tracker.metadata(id, "gc.outcome", "pass")
        return yield* tracker.close(id, reason)
      })
    },
    git,
    stages,
    worktrees,
    integrationCustody(config, commands),
    Effect.fn("Native.candidateObserved")(function* (current: Bead, candidate: typeof Candidate.Type, ordinal: number) {
      const group = yield* nativeGroup(config, commands, current)
      const attempt = yield* attemptFor(group.work)
      const plan = yield* tracker.fact(current.id, "candidate_plan", Plan)
      if (!plan) return yield* new BoundaryFailure({ message: "native candidate lost resource correlation" })
      for (const node of group.rows.filter((row) => isCandidateFactMetadata(row.metadata)))
        yield* tracker.record(node.id, `native_integration_${ordinal}`, {
          task: attempt.task,
          root: attempt.root,
          attempt: attempt.plan.attempt,
          base: attempt.plan.base,
          implementation: candidate.result,
          candidate: candidate.commit,
          head: candidate.head,
          resource: plan,
          generation: 1
        })
      return yield* Effect.void
    })
  )
  const attemptFor = Effect.fn("Native.attemptFor")(function* (work: Bead) {
    const attempt = yield* retainedFact(work, "native_attempt", NativeAttempt)
    if (!attempt || attempt.plan.bead !== work.id)
      return yield* new BoundaryFailure({ message: "native work has no exact immutable attempt" })
    if (canonical(attempt.contract) !== canonical(contract))
      return yield* new BoundaryFailure({ message: "native boundary requires its original attempt contract" })
    return attempt
  })
  const prepare = Effect.fn("Native.prepare")(function* (current: Bead) {
    yield* nativePreflight(config, contract, commands)
    const group = yield* nativeGroup(config, commands, current)
    const attempt = yield* bindNativeAttempt(config, contract, commands, tracker, git, group.work)
    yield* Ref.set(commands.current, attempt.plan.attempt)
    yield* Effect.forEach(
      group.rows.filter(
        (row) =>
          ["prepare", "qualify", "deliver"].includes(row.metadata["dalph.phase"] ?? "") &&
          isExecutionMetadata(row.metadata)
      ),
      (node) => tracker.record(node.id, "native_attempt", attempt),
      { concurrency: 2 }
    )
    yield* Effect.forEach(
      group.rows.filter(
        (row) => ["review", "fix"].includes(row.metadata["dalph.phase"] ?? "") && isExecutionMetadata(row.metadata)
      ),
      (node) => publishSharedWorkspace(config, tracker, node, attempt),
      { concurrency: 2 }
    )
    yield* tracker.record(group.root, "native_launch", { version: "native-v1", contract })
    // A retained prepared attempt keeps its already qualified original Base.
    if (!(yield* tracker.fact(group.work.id, "work_prepared", Prepared)))
      yield* stages.qualify(current.id, { ...attempt.plan, path: config.repo })
    yield* worktrees.prepare(group.work.id, "work", attempt.plan.base)
    yield* publishNativeWorkspace(config, tracker, git, attempt)
    yield* tracker.close(current.id, "Qualified Base and exact native workspace acknowledged")
  })
  const finish = Effect.fn("Native.finish")(function* (current: Bead, session: BeadId) {
    const group = yield* nativeGroup(config, commands, current)
    if (group.work.id !== current.id)
      return yield* new BoundaryFailure({ message: "only the native implementation may propose its result" })
    const attempt = yield* attemptFor(group.work)
    yield* Ref.set(commands.current, attempt.plan.attempt)
    const commit = yield* git
      .git(["rev-parse", "HEAD"], attempt.plan.path)
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitSha)))
    yield* stages.qualifiedTree(attempt.plan, commit)
    const retained = yield* tracker.fact(current.id, "native_proposal", NativeProposal)
    const proposal =
      retained ??
      (yield* Schema.decodeUnknownEffect(NativeProposal)({
        session,
        commit,
        attempt: attempt.plan.attempt,
        base: attempt.plan.base,
        task: attempt.task,
        path: attempt.plan.path
      }))
    if (proposal.session !== session || proposal.commit !== commit)
      return yield* new BoundaryFailure({
        message: "retained native proposal differs from the current writer or commit"
      })
    yield* correlatedSession(config, commands, proposal, attempt, tracker)
    if (!retained) yield* tracker.record(current.id, "native_proposal", proposal)
    yield* tracker.close(
      current.id,
      "Native implementation proposed a committed result; acceptance and delivery remain pending"
    )
  })
  const reviewedCandidate = Effect.fn("Native.reviewedCandidate")(function* (
    group: { work: Bead; rows: ReadonlyArray<Bead> },
    attempt: typeof NativeAttempt.Type,
    proposal: typeof NativeProposal.Type,
    batch: string
  ) {
    if (group.work.metadata?.["dalph.review_required"] !== "true") return proposal.commit
    const rounds = group.rows
      .filter(
        (row) =>
          row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata) && reviewBatch(row) === batch
      )
      .map((row) => Number(row.metadata?.["gc.iteration"]))
      .filter(Number.isInteger)
    const round = Math.max(0, ...rounds)
    const approved = yield* retainedFact(
      group.work,
      reviewFactKey("native_approved", batch, round),
      NativeReviewVerdict
    )
    if (
      !approved ||
      approved.attempt !== attempt.plan.attempt ||
      approved.task !== attempt.task ||
      approved.base !== attempt.plan.base ||
      approved.findings.some((finding) => finding.disposition === "blocking")
    )
      return yield* new BoundaryFailure({ message: "no correlated clean independent review; qualification refused" })
    yield* reviewWritersStopped(
      config,
      commands,
      group.rows,
      attempt.plan.path,
      [proposal.session, approved.session],
      tracker
    )
    return approved.commit
  })
  const check = Effect.fn("Native.check")(function* (current: Bead) {
    const group = yield* nativeGroup(config, commands, current)
    const attempt = yield* attemptFor(group.work)
    const proposal = yield* retainedFact(group.work, "native_proposal", NativeProposal)
    if (!proposal)
      return yield* new BoundaryFailure({ message: "missing native implementation proposal; no acceptance" })
    yield* stoppedNativeSession(config, commands, proposal, attempt, tracker)
    yield* Ref.set(commands.current, attempt.plan.attempt)
    yield* worktrees.prepare(group.work.id, "work", attempt.plan.base)
    const candidate = yield* reviewedCandidate(group, attempt, proposal, reviewBatch(current))
    yield* stages.qualifiedTree(attempt.plan, candidate)
    yield* delivery.accept(group.work, attempt.plan, false)
    for (const node of group.rows.filter((row) => isCandidateFactMetadata(row.metadata)))
      yield* tracker.record(node.id, "native_candidate", {
        commit: candidate,
        attempt: proposal.attempt,
        base: proposal.base,
        task: proposal.task
      })
  })
  const integrate = Effect.fn("Native.integrate")(function* (current: Bead) {
    const group = yield* nativeGroup(config, commands, current)
    const attempt = yield* attemptFor(group.work)
    const proposal = yield* retainedFact(group.work, "native_proposal", NativeProposal)
    if (!proposal) return yield* new BoundaryFailure({ message: "native delivery has no correlated result" })
    yield* stoppedNativeSession(config, commands, proposal, attempt, tracker)
    const candidate = yield* reviewedCandidate(group, attempt, proposal, reviewBatch(current))
    const result = yield* retainedFact(group.work, "result", Result)
    if (!result || result.commit !== candidate || result.attempt !== attempt.plan.attempt)
      return yield* new BoundaryFailure({ message: "changed native implementation requires fresh acceptance evidence" })
    const fs = yield* FileSystem.FileSystem
    if (yield* fs.exists(attempt.plan.path)) yield* stages.qualifiedTree(attempt.plan, candidate)
    else {
      const prepared = yield* tracker.fact(group.work.id, "work_prepared", Prepared)
      if (!prepared || !(yield* cleanupMayResume(tracker, current, attempt, prepared)))
        return yield* new BoundaryFailure({
          message: "native source worktree is lost without exact applied cleanup proof"
        })
    }
    yield* delivery.integrator(current)
    yield* tracker.record(group.work.id, "native_settled", { attempt: attempt.plan.attempt })
  })
  const claim = () => nativeClaim(config, commands, tracker)
  return { prepare, finish, check, integrate, claim }
}
