import type { Candidate, Plan, Result } from "./attempt.ts"
const CANDIDATE_PARENT_COUNT = 2

/** Git supplies these ordered parents; this decision performs no Git reads. */
export function exactParents(parents: ReadonlyArray<string>, target: string, result: string): boolean {
  return parents.length === CANDIDATE_PARENT_COUNT && parents[0] === target && parents[1] === result
}

export function acceptedResultMatches(plan: Plan | null, result: typeof Result.Type): boolean {
  return plan !== null && result.attempt === plan.attempt && result.tests.commit === result.commit
}
export function candidateMatches(candidate: typeof Candidate.Type, result: typeof Result.Type): boolean {
  return (
    candidate.result === result.commit &&
    candidate.tests.commit === candidate.commit &&
    result.tests.commit === result.commit
  )
}
