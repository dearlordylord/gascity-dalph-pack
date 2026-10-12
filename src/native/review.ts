import { Effect, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { Git } from "../delivery/git.ts"
import { NativeAttempt, NativeProposal } from "./contract.ts"
import { nativeGroup } from "./identity.ts"
import { nativeSession, stoppedNativeSession } from "./session.ts"
import {
  NativeReviewVerdict,
  ReviewBlocking,
  ReviewCandidate,
  ReviewInfrastructureFailure,
  ReviewRound,
  REVIEW_ROUNDS
} from "./review-contract.ts"
import { reviewBatch, reviewIdentityMatches, reviewNodes, reviewPublicationMatches } from "./review-correlation.ts"
import { reviewWritersStopped } from "./review-writers.ts"
import { publishSharedWorkspace } from "./shared-workspace.ts"
import { reviewFactKey } from "./review-fact-key.ts"
import { retainedFact } from "./retained-fact.ts"
import { isExecutionMetadata, isReviewControlMetadata } from "./nodes.ts"
import { correlateCompletedReview, retainedReviewMatches } from "./completed-review.ts"

type Tracker = ReturnType<typeof makeTracker>
const reviewRound = (row: Bead) =>
  Schema.decodeUnknownEffect(ReviewRound)(
    Number(
      row.metadata?.["gc.iteration"] ??
        (isReviewControlMetadata(row.metadata ?? {}) ? row.metadata?.["gc.failed_attempt"] : undefined)
    )
  )
const previousRequired = (current: Bead, round: number) =>
  round > 1 || !!current.metadata?.["dalph.previous_review_batch"]
const verdictKey = (batch: string, round: number) => reviewFactKey("native_review", batch, round)

/** Native controls own iteration and retries; this boundary only validates their evidence. */
export const makeNativeReview = (config: RuntimeConfig, commands: Commands, tracker: Tracker, git: Git) => {
  const previousReview = Effect.fn("NativeReview.previous")(function* (
    current: Bead,
    round: number,
    batch: string,
    work: Bead
  ) {
    if (round > 1) return yield* retainedFact(work, verdictKey(batch, round - 1), NativeReviewVerdict)
    const previous = current.metadata?.["dalph.previous_review_batch"]
    return previous ? yield* retainedFact(work, verdictKey(previous, REVIEW_ROUNDS), NativeReviewVerdict) : null
  })
  const context = Effect.fn("NativeReview.context")(function* (current: Bead) {
    const group = yield* nativeGroup(config, commands, current)
    const attempt = yield* retainedFact(group.work, "native_attempt", NativeAttempt)
    const proposal = yield* retainedFact(group.work, "native_proposal", NativeProposal)
    if (!attempt || !proposal)
      return yield* new BoundaryFailure({ message: "review requires a retained native attempt and candidate" })
    const round = yield* reviewRound(current)
    const batch = reviewBatch(current)
    const commit = yield* git
      .git(["rev-parse", "HEAD"], attempt.plan.path)
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(NativeProposal.fields.commit)))
    if (yield* git.git(["status", "--porcelain"], attempt.plan.path))
      return yield* new BoundaryFailure({ message: "review candidate must be committed and clean" })
    const previous = yield* previousReview(current, round, batch, group.work)
    return { group, attempt, proposal, round, batch, commit, previous }
  })
  const correlated = Effect.fn("NativeReview.correlated")(function* (current: Bead, verdict: NativeReviewVerdict) {
    const facts = yield* context(current)
    const pinned = yield* retainedFact(
      facts.group.work,
      reviewFactKey("native_review_candidate", facts.batch, facts.round),
      ReviewCandidate
    )
    if (!pinned || pinned.commit !== verdict.commit)
      return yield* new BoundaryFailure({ message: "review differs from its pinned candidate" })
    if (
      !reviewIdentityMatches(verdict, {
        node: current.id,
        round: facts.round,
        batch: facts.batch,
        attempt: facts.attempt.plan.attempt,
        task: facts.attempt.task,
        base: facts.attempt.plan.base,
        commit: facts.commit
      }) ||
      verdict.session === facts.proposal.session
    )
      return yield* new BoundaryFailure({
        message: "review verdict does not correlate to the exact independent candidate"
      })
    const session = yield* nativeSession(config, commands, verdict.session)
    const writer = yield* tracker.bead(current.id)
    if (!reviewPublicationMatches(session, writer, facts.attempt.plan.path))
      yield* correlateCompletedReview(config, commands, tracker, current, facts.attempt, verdict, session)
    else if (writer.status === "closed") yield* retainedReviewMatches(tracker, writer, facts.attempt, verdict)
    return { ...facts, session }
  })
  const submit = Effect.fn("NativeReview.submit")(function* (current: Bead, input: unknown) {
    if (current.metadata?.["dalph.phase"] !== "review" || !isExecutionMetadata(current.metadata))
      return yield* new BoundaryFailure({ message: "only an independent reviewer node may submit a verdict" })
    const verdict = yield* Schema.decodeUnknownEffect(NativeReviewVerdict)(input)
    yield* correlated(current, verdict)
    yield* tracker.record(current.id, verdictKey(verdict.batch, verdict.round), verdict)
    yield* tracker.metadata(current.id, "gc.outcome", "pass")
    yield* tracker.close(current.id, "Independent structured review retained; native verdict gate remains pending")
  })
  const gate = Effect.fn("NativeReview.gate")(function* (current: Bead) {
    const group = yield* nativeGroup(config, commands, current)
    const round = yield* reviewRound(current)
    const batch = reviewBatch(current)
    const reviews = reviewNodes(group.rows, round, batch)
    const reviewer = reviews.length === 1 ? reviews[0] : undefined
    if (!reviewer)
      return yield* new ReviewInfrastructureFailure({ message: "no exact native reviewer node; no semantic verdict" })
    const verdict = yield* tracker.fact(reviewer.id, verdictKey(batch, round), NativeReviewVerdict)
    if (!verdict)
      return yield* new ReviewInfrastructureFailure({
        message: "missing structured review; provider exit is not approval"
      })
    const facts = yield* correlated(reviewer, verdict)
    yield* reviewWritersStopped(
      config,
      commands,
      group.rows,
      facts.attempt.plan.path,
      [facts.proposal.session, verdict.session],
      tracker
    )
    const findings = verdict.findings.filter((finding) => finding.disposition === "blocking")
    yield* tracker.record(group.work.id, verdictKey(batch, round), verdict)
    if (findings.length) return yield* new ReviewBlocking({ round, findings })
    yield* tracker.record(group.work.id, reviewFactKey("native_approved", batch, round), verdict)
    return verdict
  })
  const pin = Effect.fn("NativeReview.pin")(function* (current: Bead) {
    const facts = yield* context(current)
    yield* tracker.record(facts.group.work.id, reviewFactKey("native_review_candidate", facts.batch, facts.round), {
      commit: facts.commit
    })
  })
  const prepare = Effect.fn("NativeReview.prepare")(function* (current: Bead) {
    const facts = yield* context(current)
    yield* stoppedNativeSession(config, commands, facts.proposal, facts.attempt, tracker)
    const writers = facts.group.rows.filter((row) => {
      const metadata = row.metadata
      return (
        ["review", "fix"].includes(metadata["dalph.phase"] ?? "") &&
        metadata["gc.iteration"] === String(facts.round) &&
        reviewBatch(row) === facts.batch &&
        isExecutionMetadata(metadata)
      )
    })
    for (const writer of writers) {
      yield* publishSharedWorkspace(config, tracker, writer, facts.attempt)
    }
    const fixes = facts.group.rows.filter(
      (row) =>
        row.metadata?.["dalph.phase"] === "fix" &&
        row.metadata["gc.iteration"] === String(facts.round) &&
        reviewBatch(row) === facts.batch &&
        isExecutionMetadata(row.metadata)
    )
    const fix = fixes.length === 1 ? fixes[0] : undefined
    if (!fix) return yield* new BoundaryFailure({ message: "no exact native fix node" })
    const previous = facts.previous
    if (previousRequired(current, facts.round) && !previous)
      return yield* new ReviewInfrastructureFailure({
        message: "previous completed review is missing; no fixes authorized"
      })
    if (!previous?.findings.some((finding) => finding.disposition === "blocking")) {
      yield* pin(current)
      yield* tracker.metadata(fix.id, "gc.outcome", "skipped")
      yield* tracker.close(fix.id, "Exact native review iteration work settled")
    }
    yield* tracker.metadata(current.id, "gc.outcome", "pass")
    yield* tracker.close(current.id, "Exact native review iteration prepared")
  })
  const finishFix = Effect.fn("NativeReview.finishFix")(function* (
    current: Bead,
    sessionId: NativeReviewVerdict["session"]
  ) {
    if (current.metadata?.["dalph.phase"] !== "fix" || !isExecutionMetadata(current.metadata))
      return yield* new BoundaryFailure({ message: "only a native fix node may finish review repairs" })
    const facts = yield* context(current)
    const session = yield* nativeSession(config, commands, sessionId)
    const writer = yield* tracker.bead(current.id)
    if (!reviewPublicationMatches(session, writer, facts.attempt.plan.path))
      return yield* new BoundaryFailure({ message: "fix session/task/worktree correlation is unproven" })
    const key = reviewFactKey("native_fix", facts.batch, facts.round)
    if (writer.status === "closed") {
      const retained = yield* tracker.fact(
        writer.id,
        key,
        Schema.Struct({ session: NativeProposal.fields.session, commit: NativeProposal.fields.commit })
      )
      if (!retained) return yield* new BoundaryFailure({ message: "closed fix has no retained result" })
    }
    yield* tracker.record(current.id, key, { session: sessionId, commit: facts.commit })
    yield* pin(current)
    yield* tracker.metadata(current.id, "gc.outcome", "pass")
    yield* tracker.close(current.id, "Exact native review iteration work settled")
  })
  return { context, submit, gate, pin, prepare, finishFix }
}
