import { Effect, FileSystem } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { operationalRead } from "../src/native/operational-read.ts"
import { makeNativeCommands } from "../src/delivery/command.ts"

it.effect("native read classification excludes mutation operands and process launchers", () =>
  Effect.sync(() => {
    for (const args of [
      ["git", "-C", "/repo", "rev-parse", "HEAD"],
      ["git", "status"],
      ["git", "show-ref"],
      ["git", "merge-base", "--is-ancestor", "a", "b"],
      ["git", "symbolic-ref", "HEAD"],
      ["git", "remote", "get-url", "--push", "origin"],
      ["gc", "--city", "/city", "--rig", "fixture", "ready"],
      ["env", "GC_NO_API=1", "gc", "beads", "show", "task"],
      ["gc", "beads", "list"],
      ["gc", "session", "list"],
      ["gc", "config", "show"],
      ["gc", "config", "explain", "--provider", "fixture", "--json"],
      ["gc", "--city", "/city", "--rig", "fixture", "version", "--json"],
      ["gc", "agent", "list"],
      ["gc", "provider", "explain", "fixture"]
    ])
      expect(operationalRead(args)).toBe(true)
    for (const args of [
      [],
      ["git"],
      ["git", "symbolic-ref", "HEAD", "refs/heads/other"],
      ["git", "symbolic-ref", "refs/heads/other", "HEAD"],
      ["git", "remote", "set-url", "origin", "/other"],
      ["git", "remote", "add", "get-url", "/other"],
      ["git", "push"],
      ["node", "ready"],
      ["gc"],
      ["gc", "--city", "/city"],
      ["gc", "beads"],
      ["gc", "config"],
      ["gc", "config", "set", "explain"],
      ["gc", "beads", "health"],
      ["gc", "session", "close", "list"],
      ["gc", "beads", "metadata-cas", "show"],
      ["gc", "hook", "--claim"],
      ["env", "gc", "beads", "list"],
      ["gc", "worktree", "cleanup"]
    ])
      expect(operationalRead(args)).toBe(false)
  })
)

it.live("native Git observations use operational output without durable success receipts", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped()
    const commands = yield* makeNativeCommands
    yield* commands.execute(root, ["git", "init", root])
    const directory = `${root}/evidence/boundaries`
    const before = yield* fs.readDirectory(directory)
    expect(yield* commands.execute(root, ["git", "-C", root, "rev-parse", "--git-dir"])).toBe(".git")
    expect(yield* fs.readDirectory(directory)).toEqual(before)
    const rejected = yield* Effect.flip(commands.execute(root, ["git", "-C", root, "show", "missing"]))
    expect(rejected._tag).toBe("CommandRejected")
    if (rejected._tag === "CommandRejected") {
      expect(yield* fs.exists(rejected.receipt)).toBe(false)
      expect(yield* fs.exists(rejected.receipt.replace(/\.json$/, ".stdout"))).toBe(true)
    }
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)
