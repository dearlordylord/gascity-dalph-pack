import { Duration, Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { spawn } from "node:child_process"
import { makeCommandRunner, runCommand } from "../../src/quality/command.ts"

it.live("captures output and awaits successful exit", () =>
  Effect.gen(function* () {
    const result = yield* runCommand({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('out');process.stderr.write('err')"],
      timeout: Duration.seconds(2)
    })
    expect(result).toEqual({ stdout: "out", stderr: "err" })
  })
)
it.live("reports nonzero exit", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      runCommand({
        executable: process.execPath,
        args: ["-e", "process.exit(7)"],
        cwd: process.cwd(),
        timeout: Duration.seconds(2)
      })
    )
    expect(error._tag).toBe("CommandFailure")
  })
)
it.live("reports failed spawn", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      runCommand({ executable: "/missing/dalph-command", args: [], timeout: Duration.seconds(2) })
    )
    expect(error._tag).toBe("CommandFailure")
  })
)
it.live("bounds a resistant process group", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      runCommand({
        executable: process.execPath,
        args: ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
        timeout: Duration.millis(100)
      })
    )
    expect(error._tag).toBe("TimeoutError")
  })
)

it.live("reports a synchronous invalid invocation", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      runCommand({ executable: "bad\0executable", args: [], timeout: Duration.seconds(2) })
    )
    expect(error._tag).toBe("CommandFailure")
  })
)

it.live("preserves a cleanup refusal as a defect instead of claiming termination", () =>
  Effect.gen(function* () {
    const runner = makeCommandRunner({
      launch: (command) =>
        spawn(command.executable, [...command.args], { detached: true, stdio: ["ignore", "pipe", "pipe"] }),
      killGroup: () => {
        throw Object.assign(new Error("refused"), { code: "EPERM" })
      }
    })
    const result = yield* Effect.exit(
      runner({ executable: process.execPath, args: ["-e", "process.exit(0)"], timeout: Duration.seconds(2) })
    )
    expect(result._tag).toBe("Failure")
  })
)
