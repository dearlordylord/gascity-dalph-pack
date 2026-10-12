import { nativeOperationIndex } from "./command-invocation.ts"
const BEAD_OFFSET = 2
const CAS_FLAGS_OFFSET = 3
const hasExpectedValue = (args: ReadonlyArray<string>) =>
  ["--store-ref=", "--key=", "--expected=", "--next="].every((prefix) =>
    args.some((argument) => argument.startsWith(prefix))
  )

/** Conditional tracker writes reconcile through exact native read-back, not project-writer census. */
export function nativeTrackerCas(args: ReadonlyArray<string>): boolean {
  const operation = nativeOperationIndex(args)
  if (operation === undefined) return false
  return (
    args[operation] === "beads" &&
    args[operation + 1] === "metadata-cas" &&
    !!args[operation + BEAD_OFFSET] &&
    hasExpectedValue(args.slice(operation + CAS_FLAGS_OFFSET))
  )
}
