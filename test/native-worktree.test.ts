import { Duration, Effect, FileSystem, Schema } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { join } from "node:path"
import { makeCommands } from "../src/delivery/command.ts"

const Report = Schema.Struct({
  provenance: Schema.optionalKey(Schema.Struct({ attempt_id: Schema.String, base_sha: Schema.String })),
  cleanup_pending: Schema.optionalKey(Schema.Boolean),
  removed: Schema.optionalKey(Schema.Boolean),
  already_absent: Schema.optionalKey(Schema.Boolean),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.String }))
})
const provide = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped)
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped()
  const commands = yield* makeCommands
  const repo = join(root, "repo")
  yield* fs.makeDirectory(repo)
  const call = (args: ReadonlyArray<string>) => commands.execute(root, args, undefined, Duration.seconds(20))
  const git = (args: ReadonlyArray<string>, path = repo) => call(["git", "-C", path, ...args])
  yield* git(["init", "-b", "master"])
  yield* git(["config", "user.name", "Fixture"])
  yield* git(["config", "user.email", "fixture@local"])
  yield* fs.writeFileString(join(repo, "seed"), "seed\n")
  yield* git(["add", "seed"])
  yield* git(["-c", "commit.gpgsign=false", "commit", "-m", "seed"])
  const base = yield* git(["rev-parse", "HEAD"])
  const path = join(root, "worktrees/attempt")
  const args = [
    "--repo",
    repo,
    "--root",
    join(root, "worktrees"),
    "--path",
    path,
    "--branch",
    "dalph/fixture",
    "--base",
    "refs/heads/master",
    "--base-sha",
    base,
    "--bead",
    "fixture-1",
    "--store-ref",
    "rig:fixture",
    "--creator",
    "dalph-pack",
    "--owner",
    "fixture-owner",
    "--generation",
    "1",
    "--json"
  ]
  const report = (action: string, extra: ReadonlyArray<string> = [], selected = args) =>
    call(["gc", "worktree", action, ...selected, ...extra]).pipe(
      Effect.catchTag("CommandRejected", (error) => fs.readFileString(error.receipt.replace(/\.json$/, ".stdout"))),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Report)))
    )
  const prepared = yield* report("ensure")
  if (!prepared.provenance) throw new Error("native worktree missing provenance")
  const nativeAttempt = prepared.provenance.attempt_id
  const cleanup = (attempt = nativeAttempt, selected = args) => report("cleanup", ["--attempt-id", attempt], selected)
  return { args, base, call, cleanup, fs, git, path, prepared, report, root }
})
it.live(
  "native worktree preserves dirty edits and exact cleanup is idempotent",
  () =>
    provide(
      Effect.gen(function* () {
        const f = yield* fixture
        const dirty = join(f.path, "untracked")
        yield* f.fs.writeFileString(dirty, "owned fixture edit")
        expect((yield* f.cleanup()).error?.code).toBe("dirty_worktree")
        expect(yield* f.fs.exists(dirty)).toBe(true)
        yield* f.fs.remove(dirty)
        expect((yield* f.cleanup()).removed).toBe(true)
        expect((yield* f.cleanup()).already_absent).toBe(true)
      })
    ),
  30000
)
it.live(
  "native cleanup refuses foreign ownership and stale attempt identities",
  () =>
    provide(
      Effect.gen(function* () {
        const f = yield* fixture
        const foreign = [...f.args]
        foreign[foreign.indexOf("--owner") + 1] = "foreign-owner"
        expect((yield* f.cleanup(undefined, foreign)).error?.code).toBe("ownership_mismatch")
        expect((yield* f.cleanup("stale")).error?.code).toBe("stale_attempt")
        expect(yield* f.fs.exists(f.path)).toBe(true)
        expect((yield* f.cleanup()).removed).toBe(true)
      })
    ),
  30000
)
it.live(
  "original Base survives target advance and unmerged work is preserved",
  () =>
    provide(
      Effect.gen(function* () {
        const f = yield* fixture
        yield* f.fs.writeFileString(join(f.path, "result"), "task result")
        yield* f.git(["add", "result"], f.path)
        yield* f.git(["-c", "commit.gpgsign=false", "commit", "-m", "result"], f.path)
        expect((yield* f.cleanup()).error?.code).toBe("unmerged_commits")
        yield* f.git(["merge", "--ff-only", "dalph/fixture"])
        expect((yield* f.report("verify")).provenance?.base_sha).toBe(f.base)
        expect((yield* f.cleanup()).removed).toBe(true)
      })
    ),
  30000
)
it.live(
  "a lost native cleanup response is recovered by observing absence without recreating",
  () =>
    provide(
      Effect.gen(function* () {
        const f = yield* fixture
        const attempt = f.prepared.provenance?.attempt_id
        if (!attempt) throw new Error("fixture attempt")
        const program =
          "const {spawnSync}=require('node:child_process');const result=spawnSync(process.argv[1],process.argv.slice(2),{stdio:'ignore'});process.exit(result.status===0?91:92)"
        const failure = yield* Effect.flip(
          f.call([process.execPath, "-e", program, "gc", "worktree", "cleanup", ...f.args, "--attempt-id", attempt])
        )
        expect(failure._tag).toBe("CommandRejected")
        if (failure._tag === "CommandRejected") expect(failure.exit).toBe(91)
        expect(yield* f.fs.exists(f.path)).toBe(false)
        expect((yield* f.cleanup()).already_absent).toBe(true)
      })
    ),
  30000
)
