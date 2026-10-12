import { nativeOperationIndex } from "./command-invocation.ts"

const SESSION_OFFSET = 2
const JSON_OFFSET = 3
const CLOSE_ARGUMENTS = 4

/** Exact native close is reconciled by repeating close and reading its correlated session. */
export function nativeSessionClose(args: ReadonlyArray<string>): boolean {
  const operation = nativeOperationIndex(args)
  if (operation === undefined) return false
  const session = args[operation + SESSION_OFFSET]
  return (
    args[operation] === "session" &&
    args[operation + 1] === "close" &&
    !!session &&
    !session.startsWith("-") &&
    args[operation + JSON_OFFSET] === "--json" &&
    args.length === operation + CLOSE_ARGUMENTS
  )
}
