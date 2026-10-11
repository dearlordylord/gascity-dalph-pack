import { spawn } from "node:child_process"
import { join } from "node:path"
import { Effect, FileSystem, Exit } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { targetGuard } from "../src/delivery/guard.ts"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { makeGit } from "../src/delivery/git.ts"
import { makeFixture } from "./helpers/workflow-fixture.ts"

const provide = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped)
it.live("the OS lock serializes competing scopes and releases its exact helper", () =>
  provide(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const events: number[] = []
      const run = (id: number) =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* targetGuard(join(root, "guard"))
            events.push(id)
            yield* Effect.sleep("30 millis")
            events.push(id)
          })
        )
      yield* Effect.all([run(1), run(2)], { concurrency: "unbounded" })
      expect(events[0]).toBe(events[1])
      expect(events[2]).toBe(events[3])
      expect(events[0]).not.toBe(events[2])
    })
  )
)
it.live("guard acquisition rejects synchronous launch failures, child launch errors and exits", () =>
  provide(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const control = {
        launch: () => spawn("/missing-flock", [], { detached: true, stdio: ["pipe", "pipe", "pipe"] }),
        killGroup: () => {}
      }
      expect(String(yield* Effect.flip(Effect.scoped(targetGuard(join(root, "guard"), control))))).toContain("ENOENT")
      expect(String(yield* Effect.flip(Effect.scoped(targetGuard("invalid\0path"))))).toContain("GuardUnavailable")
      expect(String(yield* Effect.flip(Effect.scoped(targetGuard(join(root, "absent/guard")))))).toContain(
        "guard helper exited"
      )
    })
  )
)
it.live("guard cleanup ignores only observed absence and preserves other cleanup defects", () =>
  provide(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      for (const code of ["ESRCH", "EPERM"]) {
        const control = {
          launch: (path: string) =>
            spawn("flock", [path, "sh", "-c", "printf acquired; cat >/dev/null"], {
              detached: true,
              stdio: ["pipe", "pipe", "pipe"]
            }),
          killGroup: (pid: number) => {
            process.kill(-pid, "SIGKILL")
            throw Object.assign(new Error(code), { code })
          }
        }
        const outcome = yield* Effect.exit(Effect.scoped(targetGuard(join(root, code), control)))
        expect(Exit.isSuccess(outcome)).toBe(code === "ESRCH")
      }
    })
  )
)
it.live("Git resolves the authoritative common directory before holding its scoped target guard", () =>
  provide(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const fixture = yield* makeFixture
      const requests: ReadonlyArray<string>[] = []
      const commands = {
        ...fixture.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          Effect.sync(() => {
            requests.push(args)
            return root
          })
      }
      const git = makeGit(fixture.config, commands)
      expect(yield* git.git(["status"])).toBe(root)
      expect(yield* git.git(["status"], AbsolutePath.make("/other/repo"))).toBe(root)
      expect(yield* git.guarded(Effect.succeed("accepted"))).toBe("accepted")
      expect(requests.at(-1)).toContain("--git-common-dir")
    })
  )
)
