const OPTION_PAIR = 2
function gitRead(args: ReadonlyArray<string>): boolean {
  const operation = args[1] === "-C" ? args[3] : args[1]
  if (["rev-parse", "status", "show", "show-ref", "merge-base"].includes(operation ?? "")) return true
  if (operation === "symbolic-ref") return args[args.length - 1] === "HEAD"
  return operation === "remote" && args.includes("get-url")
}
function nativeRead(args: ReadonlyArray<string>): boolean {
  const nativeOperations = new Map([
    ["beads", ["show", "list"]],
    ["session", ["list"]],
    ["config", ["show"]],
    ["agent", ["list"]],
    ["provider", ["explain"]]
  ])
  let index = args.indexOf("gc") + 1
  while (args[index] === "--city" || args[index] === "--rig") index += OPTION_PAIR
  const command = args[index] ?? ""
  if (command === "ready") return true
  return (nativeOperations.get(command) ?? []).includes(args[index + 1] ?? "")
}
/** These observations cannot mutate the owned Git refs or native workflow facts. */
export function operationalRead(args: ReadonlyArray<string>): boolean {
  const executable = args[0]
  if (executable === "git") return gitRead(args)
  if (executable === "gc") return nativeRead(args)
  if (executable === "env" && args.includes("GC_NO_API=1") && args.includes("gc")) return nativeRead(args)
  return false
}
