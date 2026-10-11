import { Effect, Schema } from "effect"
import { Candidate, Plan, type Result } from "../domain/attempt.ts"
import { exactParents } from "../domain/candidate.ts"
import { BoundaryFailure, CommitSha, type BeadId } from "../domain/shared.ts"
import type { makeTracker } from "./tracker.ts"
import type { makeStages } from "./stages.ts"
import type { Git } from "./git.ts"

type Tracker = ReturnType<typeof makeTracker>
const CANDIDATE_LIMIT = 3
const FIRST_CANDIDATE = 1
const Refresh = Schema.Struct({ prior: CommitSha, head: CommitSha, result: CommitSha })
export function candidateKey(ordinal: number): string {
  return ordinal === 1 ? "candidate" : `candidate_${ordinal}`
}

/** Immutable native facts retain each integration revision, never a mutable approval. */
export const retainedCandidate = Effect.fn("Delivery.retainedCandidate")(function* (tracker: Tracker, id: BeadId) {
  let ordinal = FIRST_CANDIDATE
  let candidate = yield* tracker.fact(id, "candidate", Candidate)
  for (let next = FIRST_CANDIDATE + 1; next <= CANDIDATE_LIMIT; next++) {
    const retained = yield* tracker.fact(id, candidateKey(next), Candidate)
    if (!retained) break
    candidate = retained
    ordinal = next
  }
  return { candidate, ordinal }
})

export const unfinishedRefresh = (tracker: Tracker, id: BeadId, ordinal: number) =>
  tracker.fact(id, `${candidateKey(ordinal + 1)}_refresh`, Refresh)

const mergeRefresh = Effect.fn("Delivery.mergeRefresh")(function* (
  git: Git,
  stages: ReturnType<typeof makeStages>,
  plan: Plan,
  prior: typeof Candidate.Type,
  intent: typeof Refresh.Type
) {
  const current = yield* git.git(["rev-parse", "HEAD"], plan.path)
  if (current === prior.commit) {
    yield* stages.qualifiedTree(plan, prior.commit)
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
        intent.head
      ],
      plan.path
    )
  }
  const commit = yield* git
    .git(["rev-parse", "HEAD"], plan.path)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitSha)))
  const parents = (yield* git.git(["show", "-s", "--format=%P", commit])).split(" ")
  if (!exactParents(parents, prior.commit, intent.head))
    return yield* new BoundaryFailure({ message: "refreshed candidate has foreign parents; retain resources" })
  yield* git.git(["merge-base", "--is-ancestor", intent.result, commit])
  return commit
})

export const refreshCandidate = Effect.fn("Delivery.refreshCandidate")(function* (
  tracker: Tracker,
  git: Git,
  stages: ReturnType<typeof makeStages>,
  id: BeadId,
  prior: typeof Candidate.Type,
  result: typeof Result.Type,
  head: CommitSha,
  ordinal: number
) {
  if (ordinal >= CANDIDATE_LIMIT)
    return yield* new BoundaryFailure({ message: "candidate refresh budget exhausted; retain exact resources" })
  yield* git.git(["merge-base", "--is-ancestor", prior.head, head])
  const plan = yield* tracker.fact(id, "candidate_plan", Plan)
  if (!plan) return yield* new BoundaryFailure({ message: "candidate refresh has no exact plan" })
  const key = candidateKey(ordinal + 1)
  const retained = yield* tracker.fact(id, `${key}_refresh`, Refresh)
  const intent = retained ?? { prior: prior.commit, head, result: result.commit }
  if (intent.prior !== prior.commit || intent.result !== result.commit)
    return yield* new BoundaryFailure({ message: "candidate refresh changed accepted result" })
  yield* tracker.record(id, `${key}_refresh`, intent)
  const commit = yield* mergeRefresh(git, stages, plan, prior, intent)
  const tests = yield* stages.qualify(id, plan, key)
  const candidate = { commit, head: intent.head, result: result.commit, tests }
  yield* tracker.record(id, key, candidate)
  return candidate
})
