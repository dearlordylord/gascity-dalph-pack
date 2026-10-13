const SESSION_DETAIL_ARGUMENTS = 4
function exactSessionDetail(args: ReadonlyArray<string>): boolean {
  return (
    args.length === SESSION_DETAIL_ARGUMENTS &&
    args[1] === "show" &&
    !!args[2] &&
    !args[2]?.startsWith("-") &&
    args[3] === "--json"
  )
}
const OPTION_PAIR = 2
function gitRead(args: ReadonlyArray<string>): boolean {
  const operation = args[1] === "-C" ? args[3] : args[1]
  if (["rev-parse", "status", "show", "show-ref", "merge-base"].includes(operation ?? "")) return true
  if (operation === "symbolic-ref")
    return (
      args
        .slice(args.indexOf(operation) + 1)
        .filter((arg) => arg !== "-q" && arg !== "--short")
        .join(" ") === "HEAD"
    )
  return operation === "remote" && args[args.indexOf(operation) + 1] === "get-url"
}
function nativeRead(args: ReadonlyArray<string>): boolean {
  const nativeOperations = new Map([
    ["beads", ["show", "list"]],
    ["session", ["list"]],
    ["config", ["show", "explain"]],
    ["agent", ["list"]],
    ["provider", ["explain"]]
  ])
  let index = args.indexOf("gc") + 1
  while (args[index] === "--city" || args[index] === "--rig") index += OPTION_PAIR
  const command = args[index] ?? ""
  if (command === "bd") return exactSessionDetail(args.slice(index))
  if (["ready", "version"].includes(command)) return true
  return (nativeOperations.get(command) ?? []).includes(args[index + 1] ?? "")
}
function versionRead(args: ReadonlyArray<string>): boolean {
  const executable = args[0]
  if (args.length !== OPTION_PAIR) return false
  if (executable === "tmux") return args[1] === "-V"
  return ["node", "codex", "claude"].includes(executable ?? "") && args[1] === "--version"
}
/** These observations cannot mutate the owned Git refs or native workflow facts. */
export function operationalRead(args: ReadonlyArray<string>): boolean {
  const executable = args[0]
  if (versionRead(args)) return true
  if (executable === "git") return gitRead(args)
  if (executable === "gc") return nativeRead(args)
  if (executable === "env" && args.includes("GC_NO_API=1") && args.includes("gc")) return nativeRead(args)
  return false
}
