import { nativeOperationIndex } from "./command-invocation.ts"

/** GC owns self-hook claim custody; operator targets and copied environments remain excluded. */
export function nativeHookCommand(args: ReadonlyArray<string>): boolean {
  const operation = nativeOperationIndex(args)
  if (operation === undefined || args[0] !== "gc") return false
  const command = args.slice(operation).join("\0")
  return command === "hook\0current\0--id-only" || command === "hook\0--claim\0--drain-ack\0--json"
}
