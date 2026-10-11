const CANDIDATE_PARENT_COUNT = 2

/** Git supplies these ordered parents; this decision performs no Git reads. */
export function exactParents(parents: ReadonlyArray<string>, target: string, result: string): boolean {
  return parents.length === CANDIDATE_PARENT_COUNT && parents[0] === target && parents[1] === result
}
