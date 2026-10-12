import { Effect, FileSystem, Layer, PlatformError } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { nativeTrackerCas } from "../src/native/tracker-cas.ts"
import { nativeTrackerArgs } from "../src/native/tracker-command.ts"
import { makeNativeCommands } from "../src/delivery/command.ts"
import { nativeSessionClose } from "../src/native/session-close-command.ts"

const request = [
  "gc",
  "--city",
  "/city",
  "--rig",
  "fixture",
  "beads",
  "metadata-cas",
  "task",
  "--store-ref=rig:fixture",
  "--key=dalph.result",
  "--expected=",
  "--next=value",
  "--json"
]

it.effect("only conditional native tracker writes receive tracker-owned reconciliation", () =>
  Effect.sync(() => {
    expect(nativeTrackerCas(request)).toBe(true)
    expect(nativeTrackerCas(nativeTrackerArgs(request))).toBe(true)
    for (const args of [
      [],
      ["sh", "-c", ...request],
      ["env", ...request],
      ["gc", "beads", "metadata-cas"],
      request.filter((arg) => !arg.startsWith("--expected=")),
      request.filter((arg) => !arg.startsWith("--next=")),
      request.map((arg) => (arg === "metadata-cas" ? "close" : arg)),
      nativeTrackerArgs(["sh", "-c", ...request])
    ])
      expect(nativeTrackerCas(args)).toBe(false)
  })
)

it.effect("only an exact native session close delegates its idempotent outcome", () =>
  Effect.sync(() => {
    const close = ["gc", "--city", "/city", "session", "close", "session", "--json"]
    expect(nativeSessionClose(close)).toBe(true)
    expect(nativeSessionClose(nativeTrackerArgs(close))).toBe(true)
    for (const args of [
      [],
      ["sh", "-c", ...close],
      ["env", ...close],
      close.slice(0, -1),
      close.slice(0, -2),
      [...close, "extra"],
      close.map((arg, index) => (index === close.indexOf("close") + 1 ? "--all" : arg)),
      close.map((arg) => (arg === "close" ? "kill" : arg)),
      close.map((arg) => (arg === "session" ? "--all" : arg))
    ])
      expect(nativeSessionClose(args)).toBe(false)
  })
)

it.live(
  "native tracker CAS, close and observations do not census unrelated host processes; project commands still do",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const bin = `${root}/bin`
      yield* fs.makeDirectory(bin)
      yield* fs.writeFileString(
        `${bin}/gc`,
        "#!/bin/sh\ncase \"$*\" in *--next=reject*) exit 7;; esac\nprintf '%s\\n' '{\"ok\":true}'\n"
      )
      yield* fs.chmod(`${bin}/gc`, 0o755)
      let scans = 0
      const denied = {
        ...fs,
        readDirectory: (path: string) => {
          if (path !== "/proc") return fs.readDirectory(path)
          scans++
          return Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "readDirectory",
              pathOrDescriptor: path
            })
          )
        }
      }
      yield* Effect.gen(function* () {
        const commands = yield* makeNativeCommands
        const args = nativeTrackerArgs([`PATH=${bin}`, ...request])
        expect(yield* commands.execute(root, args)).toBe('{"ok":true}')
        expect(scans).toBe(0)
        expect(
          yield* commands.execute(
            root,
            nativeTrackerArgs([`PATH=${bin}`, "gc", "--city", "/city", "session", "close", "known-session", "--json"])
          )
        ).toBe('{"ok":true}')
        expect(scans).toBe(0)
        const logs = { stdout: `${root}/native.stdout`, stderr: `${root}/native.stderr` }
        expect(yield* commands.execute(root, args, undefined, undefined, logs)).toBe('{"ok":true}')
        expect(yield* fs.readFileString(logs.stdout)).toContain('{"ok":true}')
        expect(yield* fs.exists(logs.stderr)).toBe(true)
        expect(scans).toBe(0)
        const failed = yield* Effect.flip(
          commands.execute(
            root,
            args.map((arg) => (arg === "--next=value" ? "--next=reject" : arg))
          )
        )
        expect(failed._tag).toBe("CommandRejected")
        if (failed._tag === "CommandRejected") {
          expect(failed.exit).toBe(7)
          expect(yield* fs.exists(failed.receipt)).toBe(false)
          expect(yield* fs.exists(failed.receipt.replace(/\.json$/, ".stderr"))).toBe(true)
        }
        expect(scans).toBe(0)
        expect(yield* commands.execute(root, ["git", "rev-parse", "--is-inside-work-tree"], process.cwd())).toBe("true")
        expect(scans).toBe(0)
        yield* Effect.flip(commands.execute(root, ["node", "--version"]))
        expect(scans).toBeGreaterThan(0)
      }).pipe(Effect.provide(Layer.succeed(FileSystem.FileSystem, denied)))
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)
