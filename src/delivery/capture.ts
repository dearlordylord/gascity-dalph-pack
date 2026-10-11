import { spawn } from "node:child_process"
import { open } from "node:fs/promises"
import { type Duration, Effect } from "effect"
import type { AttemptId } from "../domain/shared.ts"
import { makeCommandRunner } from "../quality/command.ts"

export const capture = Effect.fn("Execution.capture")(function* (
  executable: string,
  args: ReadonlyArray<string>,
  cwd: string | undefined,
  timeout: Duration.Duration,
  stdout: string,
  stderr: string,
  nonce: string,
  attempt: AttemptId | null
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const outputFile = yield* Effect.acquireRelease(
        Effect.tryPromise(() => open(stdout, "w")),
        (file) => Effect.promise(() => file.close())
      )
      const errorFile = yield* Effect.acquireRelease(
        Effect.tryPromise(() => open(stderr, "w")),
        (file) => Effect.promise(() => file.close())
      )
      const runner = makeCommandRunner({
        launch: (command) =>
          spawn(command.executable, [...command.args], {
            ...(command.cwd ? { cwd: command.cwd } : {}),
            detached: true,
            env: { ...process.env, DALPH_BOUNDARY: nonce, ...(attempt ? { DALPH_ATTEMPT: attempt } : {}) },
            stdio: ["ignore", outputFile.fd, errorFile.fd]
          }),
        killGroup: (pid) => {
          process.kill(-pid, "SIGKILL")
        }
      })
      return yield* runner({ executable, args: args.slice(1), ...(cwd ? { cwd } : {}), timeout }).pipe(Effect.result)
    })
  )
})
