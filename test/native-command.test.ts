import { Effect, FileSystem, Ref, Schema, Duration } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { join } from "node:path"
import { makeCommands } from "../src/delivery/command.ts"
import { AttemptId, BirthTicks, ProcessId } from "../src/domain/shared.ts"
import { parseProcessStat } from "../src/delivery/process-observation.ts"

const provide = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped)
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped()
  const commands = yield* makeCommands
  return { commands, fs, root }
})
it.live(
  "records intent and actual process output before observation; successful receipts are reconciled idempotently",
  () =>
    provide(
      Effect.gen(function* () {
        const { commands, fs, root } = yield* fixture
        expect(yield* commands.execute(root, [process.execPath, "-e", "process.stdout.write('accepted')"])).toBe(
          "accepted"
        )
        const directory = join(root, "evidence/boundaries")
        const receipts = (yield* fs.readDirectory(directory)).filter((name) => name.endsWith(".json"))
        const before = yield* fs.readFileString(join(directory, receipts[0] ?? "missing"))
        expect(JSON.parse(before).observation.stopped_writers).toBe(true)
        yield* commands.reconcile(root, null)
        expect(yield* fs.readFileString(join(directory, receipts[0] ?? "missing"))).toBe(before)
        yield* commands.reconcile(join(root, "missing"), null)
      })
    )
)
it.live("retains nonzero exits, missing executables, timeouts and invalid invocations as failures", () =>
  provide(
    Effect.gen(function* () {
      const { commands, root } = yield* fixture
      expect((yield* Effect.flip(commands.execute(root, [])))._tag).toBe("BoundaryFailure")
      const failed = yield* Effect.flip(commands.execute(root, [process.execPath, "-e", "process.exit(7)"]))
      expect(failed._tag).toBe("CommandRejected")
      if (failed._tag === "CommandRejected") expect(failed.exit).toBe(7)
      expect((yield* Effect.flip(commands.execute(root, ["/missing/native-command"])))._tag).toBe("CommandRejected")
      expect(
        (yield* Effect.flip(
          commands.execute(root, [process.execPath, "-e", "setInterval(()=>{},1000)"], root, Duration.millis(100))
        ))._tag
      ).toBe("CommandRejected")
    })
  )
)
it.live("private attempt markers and custom stage logs belong to the exact child", () =>
  provide(
    Effect.gen(function* () {
      const { commands, fs, root } = yield* fixture
      const attempt = AttemptId.make("exact-attempt")
      yield* Ref.set(commands.current, attempt)
      const stdout = join(root, "model.stdout")
      const stderr = join(root, "model.stderr")
      expect(
        yield* commands.execute(
          root,
          [
            process.execPath,
            "-e",
            "process.stdout.write(process.env.DALPH_ATTEMPT);process.stderr.write('diagnostic')"
          ],
          root,
          Duration.seconds(2),
          { stdout, stderr }
        )
      ).toBe(attempt)
      expect(yield* fs.readFileString(stderr)).toBe("diagnostic")
      yield* commands.reconcile(root, null)
    })
  )
)
it.live("reconciles stopped orphan custody without creating a success receipt, and preserves live owners", () =>
  provide(
    Effect.gen(function* () {
      const { commands, fs, root } = yield* fixture
      const directory = join(root, "evidence/boundaries")
      yield* fs.makeDirectory(directory, { recursive: true })
      const self = yield* fs.readFileString("/proc/self/stat").pipe(Effect.flatMap(parseProcessStat))
      const intent = {
        attempt: null,
        nonce: "no-writer",
        birth_ticks: BirthTicks.make(1),
        owner_pid: process.pid,
        owner_birth: String(self.birth),
        args: ["fixture"],
        cwd: null,
        timeout_seconds: 1,
        started: 0
      }
      const path = join(directory, "orphan.json")
      yield* fs.writeFileString(path, JSON.stringify({ intent }))
      yield* commands.reconcile(root, null, true)
      expect(yield* fs.readFileString(path)).toBe(JSON.stringify({ intent }))
      yield* fs.writeFileString(path, JSON.stringify({ intent: { ...intent, owner_birth: "0" } }))
      yield* commands.reconcile(root, null, true)
      const value = yield* fs
        .readFileString(path)
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.JsonObject))))
      expect(value.reconciliation).toEqual(expect.objectContaining({ state: "stopped_without_success_receipt" }))
      expect(value).not.toHaveProperty("exit")
    })
  )
)
it.live(
  "escaped descendants retain custody until a fresh stopped proof; reconciliation preserves observations",
  () =>
    provide(
      Effect.gen(function* () {
        const { fs, root } = yield* fixture
        const attempt = AttemptId.make("escaped-attempt")
        const stdout = join(root, "escaped.stdout")
        // Exercise real liveness for the child this fixture spawned. Other host
        // processes are outside this test; unreadable census cases have controlled tests.
        const scopedFs = {
          ...fs,
          readDirectory: (path: string) =>
            path === "/proc"
              ? fs.readFileString(stdout).pipe(
                  Effect.flatMap((pid) => Schema.decodeUnknownEffect(ProcessId)(Number(pid))),
                  Effect.map((pid) => [String(pid)])
                )
              : fs.readDirectory(path)
        }
        const commands = yield* makeCommands.pipe(Effect.provideService(FileSystem.FileSystem, scopedFs))
        yield* Ref.set(commands.current, attempt)
        const program =
          "const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});process.stdout.write(String(child.pid));setInterval(()=>{},1000)"
        yield* Effect.acquireRelease(Effect.void, () =>
          Effect.gen(function* () {
            const pid = yield* Schema.decodeUnknownEffect(ProcessId)(Number(yield* fs.readFileString(stdout)))
            yield* Effect.sync(() => {
              try {
                process.kill(pid, "SIGKILL")
              } catch (error) {
                if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
              }
            })
          }).pipe(Effect.ignore)
        )
        expect(
          String(
            yield* Effect.flip(
              commands.execute(root, [process.execPath, "-e", program], root, Duration.seconds(1), {
                stdout,
                stderr: join(root, "escaped.stderr")
              })
            )
          )
        ).toContain("descendants still live")
        expect(String(yield* Effect.flip(commands.reconcile(root, attempt)))).toContain("live writers")
        const pid = yield* Schema.decodeUnknownEffect(ProcessId)(Number(yield* fs.readFileString(stdout)))
        yield* Effect.sync(() => process.kill(pid, "SIGKILL"))
        yield* Effect.sleep("50 millis")
        yield* commands.reconcile(root, attempt)
        const directory = join(root, "evidence/boundaries")
        const name = (yield* fs.readDirectory(directory)).find((name) => name.endsWith(".json"))
        const receipt = JSON.parse(yield* fs.readFileString(join(directory, name ?? "missing")))
        expect(receipt.observation.stopped_writers).toBe(true)
        expect(receipt.observation.outcome).toBe("Failed")
        expect(receipt.observation).not.toHaveProperty("exit")
        expect(receipt.reconciliation.state).toBe("stopped_without_success_receipt")
      })
    ),
  15000
)
it.live("orphan reconciliation releases an absent owner and a same-pid stopped owner", () =>
  provide(
    Effect.gen(function* () {
      const { commands, fs, root } = yield* fixture
      const directory = join(root, "evidence/boundaries")
      yield* fs.makeDirectory(directory, { recursive: true })
      const intent = {
        attempt: null,
        nonce: "absent",
        birth_ticks: 1,
        owner_pid: 2147483647,
        owner_birth: "1",
        args: [],
        cwd: null,
        timeout_seconds: 1,
        started: 0
      }
      yield* fs.writeFileString(join(directory, "missing-owner.json"), JSON.stringify({ intent }))
      yield* commands.reconcile(root, null, true)
      expect(
        JSON.parse(yield* fs.readFileString(join(directory, "missing-owner.json"))).observation.stopped_writers
      ).toBe(true)
    })
  )
)
