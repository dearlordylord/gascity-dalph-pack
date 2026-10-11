// Internal comparisons consume already decoded native observations.
export function cityScopeMatches(
  expected: { readonly cityName: string; readonly rig: string; readonly repo: string },
  observed: {
    readonly workspace: { readonly name: string }
    readonly rigs: ReadonlyArray<{ readonly name: string; readonly path: string }>
  }
): boolean {
  const rigs = observed.rigs.filter((rig) => rig.name === expected.rig)
  return observed.workspace.name === expected.cityName && rigs.length === 1 && rigs[0]?.path === expected.repo
}

export function claimOwnershipMatches(
  expectedRoute: string,
  claim: { readonly route: string; readonly assignee: string },
  task: { readonly routedTo: string | undefined; readonly assignee: string | undefined }
): boolean {
  return claim.route === expectedRoute && task.routedTo === expectedRoute && task.assignee === claim.assignee
}

export function implementationIdentityMatches(
  delivery: Readonly<Record<string, string>> | undefined,
  work: Readonly<Record<string, string>> | undefined
): boolean {
  if (!delivery?.["dalph.task"] || !delivery["gc.root_bead_id"] || !work) return false
  return (
    work["dalph.task"] === delivery["dalph.task"] &&
    work["gc.root_bead_id"] === delivery["gc.root_bead_id"] &&
    work["dalph.phase"] === "work"
  )
}
