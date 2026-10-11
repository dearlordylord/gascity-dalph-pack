import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { Effect, Schema } from "effect"

export class GuardUnavailable extends Schema.TaggedError<GuardUnavailable>()("GuardUnavailable", {
  message: Schema.String
}) {}

/** Native helper ownership is injected for boundary-failure qualification. */
export interface GuardControl {
  readonly launch: (path: string) => ChildProcessWithoutNullStreams
  readonly killGroup: (pid: number) => void
}
const launch = (path: string): ChildProcessWithoutNullStreams =>
  spawn("flock", ["--exclusive", "--timeout", "120", path, "sh", "-c", "printf acquired; cat >/dev/null"], {
    detached: true,
    stdio: ["pipe", "pipe", "pipe"]
  })
const nativeControl: GuardControl = {
  launch,
  killGroup: (pid) => {
    process.kill(-pid, "SIGKILL")
  }
}

/** An OS flock survives ambiguous parent loss until its exact helper exits. */
export const targetGuard = Effect.fn("Git.targetGuard")((path: string, control = nativeControl) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const child = yield* Effect.try({
        try: () => control.launch(path),
        catch: (error) => new GuardUnavailable({ message: String(error) })
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          child.stdin.end()
          if (child.pid !== undefined) {
            try {
              control.killGroup(child.pid)
            } catch (error) {
              if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
            }
          }
        })
      )
      yield* Effect.callback<void, GuardUnavailable>((resume) => {
        child.stdout.once("data", () => resume(Effect.void))
        child.once("error", (error: Error) => resume(Effect.fail(new GuardUnavailable({ message: error.message }))))
        child.once("exit", (code: number | null) =>
          resume(Effect.fail(new GuardUnavailable({ message: `guard helper exited ${code}` })))
        )
      }).pipe(Effect.timeout("125 seconds"))
      return child
    }),
    (child) =>
      Effect.sync(() => {
        child.stdin.end()
      })
  )
)
