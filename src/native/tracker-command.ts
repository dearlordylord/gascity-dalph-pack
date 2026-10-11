/** Tracker backend helpers are native infrastructure, not project writers. */
export function nativeTrackerArgs(args: ReadonlyArray<string>): ReadonlyArray<string> {
  return ["env", "-u", "DALPH_BOUNDARY", "-u", "DALPH_ATTEMPT", "-u", "GC_SESSION_ID", ...args]
}
