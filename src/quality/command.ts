import { spawn, type ChildProcess } from "node:child_process"
import { type Duration, Effect, Schema } from "effect"

export class CommandFailure extends Schema.TaggedError<CommandFailure>()("CommandFailure", {
  command: Schema.String,
  message: Schema.String,
  exit: Schema.optionalKey(Schema.Number),
  signal: Schema.optionalKey(Schema.NullOr(Schema.String)),
  stdout: Schema.optionalKey(Schema.String),
  stderr: Schema.optionalKey(Schema.String)
}) {}

// An internal port: command options are constructed by the gate, never decoded from external input.
export interface Command {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd?: string
  readonly timeout: Duration.Duration
}

// Injectable operating-system port; tests exercise failure custody without monkey-patching globals.
export interface ProcessControl {
  readonly launch: (command: Command) => ChildProcess
  readonly killGroup: (pid: number) => void
}

export const makeCommandRunner = (control: ProcessControl) =>
  Effect.fn("Quality.runCommand")((command: Command) =>
    Effect.scoped(
      Effect.gen(function* () {
        const child = yield* Effect.acquireRelease(
          Effect.try({
            try: () => control.launch(command),
            catch: (error) => new CommandFailure({ command: command.executable, message: String(error) })
          }),
          (child) =>
            Effect.sync(() => {
              if (child.pid === undefined) return
              try {
                control.killGroup(child.pid)
              } catch (error) {
                if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
              }
            })
        )
        return yield* Effect.callback<{ readonly stdout: string; readonly stderr: string }, CommandFailure>(
          (resume) => {
            let stdout = ""
            let stderr = ""
            child.stdout?.on("data", (data: Buffer) => {
              stdout += data.toString()
            })
            child.stderr?.on("data", (data: Buffer) => {
              stderr += data.toString()
            })
            child.once("error", (error) =>
              resume(Effect.fail(new CommandFailure({ command: command.executable, message: error.message })))
            )
            child.once("close", (code, signal) =>
              resume(
                code === 0
                  ? Effect.succeed({ stdout, stderr })
                  : Effect.fail(
                      new CommandFailure({
                        command: command.executable,
                        ...(code === null ? {} : { exit: code }),
                        signal,
                        stdout,
                        stderr,
                        message: `exit ${code}, signal ${signal}: ${stderr}${stdout}`
                      })
                    )
              )
            )
          }
        ).pipe(Effect.timeout(command.timeout))
      })
    )
  )

export const runCommand = makeCommandRunner({
  launch: (command) =>
    spawn(command.executable, [...command.args], {
      ...(command.cwd ? { cwd: command.cwd } : {}),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    }),
  killGroup: (pid) => {
    process.kill(-pid, "SIGKILL")
  }
})
