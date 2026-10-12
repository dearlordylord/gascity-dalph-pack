const SCRUBBED_TRACKER = ["env", "-u", "DALPH_BOUNDARY", "-u", "DALPH_ATTEMPT", "-u", "GC_SESSION_ID"]
const OPTION_PAIR_WIDTH = 2
const supportedInvocation = (args: ReadonlyArray<string>, index: number) =>
  index === 0 ||
  (args.slice(0, SCRUBBED_TRACKER.length).join("\0") === SCRUBBED_TRACKER.join("\0") &&
    args.slice(SCRUBBED_TRACKER.length, index).every((argument) => /^[A-Z_][A-Z0-9_]*=/.test(argument)))

/** Direct GC or its exact scrubbed environment wrapper; shell text never defines an API call. */
export function nativeOperationIndex(args: ReadonlyArray<string>): number | undefined {
  const index = args.indexOf("gc")
  if (index < 0 || !supportedInvocation(args, index)) return undefined
  let operation = index + 1
  while (args[operation] === "--city" || args[operation] === "--rig") operation += OPTION_PAIR_WIDTH
  return operation
}
