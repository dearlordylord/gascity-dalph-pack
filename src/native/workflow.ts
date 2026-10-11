import { Effect, Ref, Schedule, Schema } from "effect"
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
    tracker,
    git,
    stages,
    worktrees,
    integrationCustody(config, commands),
    Effect.fn("Native.candidateObserved")(function* (current: Bead, candidate: typeof Candidate.Type, ordinal: number) {
      const group = yield* nativeGroup(config, commands, current)
      const attempt = yield* attemptFor(group.work)
      const plan = yield* tracker.fact(current.id, "candidate_plan", Plan)
      if (!plan) return yield* new BoundaryFailure({ message: "native candidate lost resource correlation" })
      for (const node of group.rows)
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
    const attempt = yield* tracker.fact(work.id, "native_attempt", NativeAttempt)
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
    for (const node of group.rows) yield* tracker.record(node.id, "native_attempt", attempt)
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
        path: attempt.plan.path,
        birth: yield* commands.birth
      }))
    if (proposal.session !== session || proposal.commit !== commit)
      return yield* new BoundaryFailure({
        message: "retained native proposal differs from the current writer or commit"
      })
    yield* correlatedSession(config, commands, proposal, attempt)
    yield* tracker.record(current.id, "native_proposal", proposal)
    yield* tracker.close(
      current.id,
      "Native implementation proposed a committed result; acceptance and delivery remain pending"
    )
  })
  const check = Effect.fn("Native.check")(function* (current: Bead) {
    const group = yield* nativeGroup(config, commands, current)
    const attempt = yield* attemptFor(group.work)
    const proposal = yield* tracker.fact(group.work.id, "native_proposal", NativeProposal)
    if (!proposal)
      return yield* new BoundaryFailure({ message: "missing native implementation proposal; no acceptance" })
    yield* stoppedNativeSession(config, commands, proposal, attempt).pipe(
      Effect.retry({
        schedule: Schedule.spaced("250 millis").pipe(Schedule.upTo({ times: 40 })),
        while: (error) => error._tag === "NativeSessionPending"
      })
    )
    yield* Ref.set(commands.current, attempt.plan.attempt)
    yield* worktrees.prepare(group.work.id, "work", attempt.plan.base)
    yield* stages.qualifiedTree(attempt.plan, proposal.commit)
    yield* delivery.accept(group.work, attempt.plan, false)
    for (const node of group.rows)
      yield* tracker.record(node.id, "native_candidate", {
        commit: proposal.commit,
        attempt: proposal.attempt,
        base: proposal.base,
        task: proposal.task
      })
  })
  const integrate = Effect.fn("Native.integrate")(function* (current: Bead) {
    const group = yield* nativeGroup(config, commands, current)
    const attempt = yield* attemptFor(group.work)
    const proposal = yield* tracker.fact(group.work.id, "native_proposal", NativeProposal)
    if (!proposal) return yield* new BoundaryFailure({ message: "native delivery has no correlated result" })
    const result = yield* tracker.fact(group.work.id, "result", Result)
    if (!result || result.commit !== proposal.commit || result.attempt !== attempt.plan.attempt)
      return yield* new BoundaryFailure({ message: "changed native implementation requires fresh acceptance evidence" })
    yield* stoppedNativeSession(config, commands, proposal, attempt)
    yield* delivery.integrator(current)
    yield* tracker.record(group.work.id, "native_settled", { attempt: attempt.plan.attempt })
  })
  const claim = () => nativeClaim(config, commands, tracker)
  return { prepare, finish, check, integrate, claim }
}
