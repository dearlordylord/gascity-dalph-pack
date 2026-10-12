import { Duration, Effect, FileSystem, Schema } from "effect"
import { join } from "node:path"
import { createServer } from "node:net"
import { RuntimeConfig } from "../../src/delivery/config.ts"
import { CommandRejected, makeCommands } from "../../src/delivery/command.ts"
import { makeGit } from "../../src/delivery/git.ts"
import { Claim } from "../../src/delivery/tracker-observation.ts"
import { makeTracker, type Commands } from "../../src/delivery/tracker.ts"
import { makeWorktrees } from "../../src/delivery/worktrees.ts"
import { makeStages } from "../../src/delivery/stages.ts"
import { makeWorkflow } from "../../src/delivery/workflow.ts"
import { runCommand } from "../../src/quality/command.ts"
import { BoundaryFailure } from "../../src/domain/shared.ts"
import { operationalRead } from "../../src/native/operational-read.ts"

export const nativeClaimBoundary =
  <E, R>(
    state: { readsFail: boolean; claims: Array<typeof Claim.Type> },
    execute: (...args: Parameters<Commands["execute"]>) => Effect.Effect<string, E, R>
  ) =>
  (...[root, args, cwd, timeout, capture]: Parameters<Commands["execute"]>) =>
    Effect.gen(function* () {
      // Discovery and identity reads must reach native before the first claim.
      if (args[0] === "gc" && args.includes("ready") && state.readsFail && state.claims.length > 0)
        return yield* new BoundaryFailure({ message: "tracker unavailable" })
      const text = yield* execute(root, args, cwd, timeout, capture)
      if (args[0] === "gc" && args.includes("hook") && args.includes("--claim"))
        state.claims.push(yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Claim))(text))
      return text
    })

const freePort = Effect.tryPromise(
  () =>
    new Promise<number>((resolve, reject) => {
      const server = createServer()
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string") return server.close(() => reject(new Error("missing port")))
        server.close(() => resolve(address.port))
      })
    })
)
export const nativeTrackerFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectory({ prefix: "s9-native-" })
  const city = join(root, "city")
  const repo = join(root, "repo")
  const home = join(root, "home")
  const pack = join(root, "pack")
  const bin = join(root, "bin")
  for (const path of [
    city,
    repo,
    home,
    bin,
    join(pack, "formulas"),
    join(pack, "agents/worker"),
    join(pack, "agents/integrator")
  ])
    yield* fs.makeDirectory(path, { recursive: true })
  const actual = yield* makeCommands
  for (const executable of ["gc", "tmux", "lsof"]) {
    const path = yield* actual.execute(root, ["sh", "-c", `command -v ${executable}`])
    yield* fs.symlink(path, join(bin, executable))
  }
  const bdPath = yield* actual.execute(root, ["sh", "-c", "command -v bd"])
  const backendBin = join(root, "native-backend")
  yield* fs.makeDirectory(backendBin)
  yield* fs.symlink(bdPath, join(backendBin, "bd"))
  const doltPath = yield* actual.execute(root, ["sh", "-c", "command -v dolt"])
  yield* fs.symlink(doltPath, join(backendBin, "dolt"))
  yield* fs.symlink(doltPath, join(bin, "dolt"))
  const env = [
    "env",
    `GC_HOME=${home}`,
    `TMUX_TMPDIR=${join(root, "tmux")}`,
    `DOLT_ROOT_PATH=${home}`,
    "GC_BEADS=bd",
    "GC_BEADS_PROXIED_NATIVE=1",
    "BD_DISABLE_METRICS=1",
    `GC_CITY=${city}`,
    `GC_CITY_PATH=${city}`,
    `GC_CITY_ROOT=${city}`,
    `PATH=${bin}:/usr/bin:/bin`,
    "GC_SESSION_ID=",
    "GC_TEMPLATE=",
    "GC_SESSION_NAME=s9-fixture",
    "GC_HOOK_CALLBACK_LANE=",
    "GC_MANAGED_SESSION_HOOK=",
    "GC_HOOK_EVENT_NAME="
  ]
  yield* Effect.flip(actual.execute(root, [...env, "sh", "-c", "command -v bd"]))
  for (const [key, value] of [
    ["user.name", "S9 Fixture"],
    ["user.email", "s9@local"]
  ])
    yield* actual.execute(root, [
      "env",
      `DOLT_ROOT_PATH=${home}`,
      doltPath,
      "config",
      "--global",
      "--add",
      String(key),
      String(value)
    ])
  const native = (args: ReadonlyArray<string>, agent = "fixture/dalph.worker") =>
    actual.execute(
      root,
      [
        ...env,
        `PATH=${backendBin}:${bin}:/usr/bin:/bin`,
        `GC_AGENT=${agent}`,
        "gc",
        "--city",
        city,
        "--rig",
        "fixture",
        ...args
      ],
      undefined,
      Duration.seconds(30)
    )
  const gitCall = (args: ReadonlyArray<string>, cwd = repo) => actual.execute(root, ["git", "-C", cwd, ...args])
  yield* gitCall(["init", "-b", "master"])
  yield* gitCall(["config", "user.name", "S9 Fixture"])
  yield* gitCall(["config", "user.email", "s9@local"])
  yield* fs.writeFileString(join(repo, "seed"), "seed\n")
  yield* gitCall(["add", "seed"])
  yield* gitCall(["-c", "commit.gpgsign=false", "commit", "-m", "seed"])
  yield* gitCall(["init", "--bare", join(root, "remote.git")])
  yield* gitCall(["remote", "add", "origin", join(root, "remote.git")])
  yield* gitCall(["push", "origin", "master"])
  yield* fs.writeFileString(join(pack, "pack.toml"), '[pack]\nname="dalph"\nschema=2\nversion="0.1.0"\n')
  for (const role of ["worker", "integrator"])
    yield* fs.writeFileString(
      join(pack, `agents/${role}/agent.toml`),
      `scope="rig"\nstart_command="false"\nmax_active_sessions=0\nwork_query='owned=$(gc --city ${city} --rig fixture ready --status in_progress --metadata-field gc.routed_to=fixture/dalph.${role} --metadata-field dalph.phase=${role === "worker" ? "work" : "deliver"} --json) || exit; if [ "$owned" != "[]" ]; then echo "$owned"; else gc --city ${city} --rig fixture ready --metadata-field gc.routed_to=fixture/dalph.${role} --unassigned --json; fi' \n`
    )
  yield* fs.writeFileString(
    join(pack, "formulas/s9.formula.toml"),
    `formula="s9"\n[requires]\nformula_compiler=">=2.0.0"\n[[steps]]\nid="task-work"\ntitle="Task work"\ndescription="Write delivered.txt and commit"\nmetadata={"gc.run_target"="dalph.worker","dalph.task"="task","dalph.phase"="work"}\n[[steps]]\nid="task-deliver"\ntitle="Task delivery"\ndescription="Publish and settle the task"\nneeds=["task-work"]\nmetadata={"gc.run_target"="dalph.integrator","dalph.task"="task","dalph.phase"="deliver"}\n`
  )
  const configFile = join(root, "initial.toml")
  yield* fs.writeFileString(
    configFile,
    `[workspace]\nname="s9"\n[workspace.env]\nBD_DISABLE_METRICS="1"\nBD_BIN="${bdPath}"\nPATH="${backendBin}:${bin}:/usr/bin:/bin"\n[beads]\nprovider="bd"\n[[rigs]]\nname="fixture"\npath="${repo}"\n[rigs.imports.dalph]\nsource="${pack}"\n`
  )
  yield* Effect.addFinalizer(() =>
    native(["stop", city]).pipe(Effect.ignore, Effect.andThen(native(["supervisor", "stop"]).pipe(Effect.ignore)))
  )
  yield* runCommand({
    executable: "env",
    args: [
      ...env.slice(1),
      `PATH=${backendBin}:${bin}:/usr/bin:/bin`,
      "gc",
      "init",
      "--name",
      "s9",
      "--file",
      configFile,
      "--no-start",
      "--skip-provider-readiness",
      city
    ],
    timeout: Duration.seconds(60)
  })
  const port = yield* freePort
  yield* fs.writeFileString(join(home, "supervisor.toml"), `[supervisor]\nport=${port}\npatrol_interval="1h"\n`)
  yield* runCommand({
    executable: "env",
    args: [...env.slice(1), `PATH=${backendBin}:${bin}:/usr/bin:/bin`, "gc", "--city", city, "start", city],
    timeout: Duration.seconds(30)
  })
  // Native provisioning may commit tracker scaffolding. Establish the product
  // baseline only after provisioning, excluding native runtime-owned files.
  yield* gitCall(["rm", "--cached", "-r", ".beads"])
  yield* fs.writeFileString(join(repo, ".gitignore"), ".beads/\n.beads.gate.lock\n.gc/\n")
  yield* gitCall(["add", ".gitignore"])
  yield* gitCall(["-c", "commit.gpgsign=false", "commit", "-m", "isolate native fixture runtime"])
  yield* gitCall(["push", "origin", "master"])
  const config = yield* Schema.decodeUnknownEffect(RuntimeConfig)({
    root,
    pack,
    city,
    repo,
    worktrees: join(root, "worktrees"),
    cityName: "s9",
    rig: "fixture",
    endpoint: `http://127.0.0.1:${port}`,
    branch: "master"
  })
  const state = {
    role: "worker",
    modelCalls: 0,
    readsFail: false,
    loseCas: false,
    casCalls: 0,
    claims: [] as Array<typeof Claim.Type>,
    casKeys: [] as string[]
  }
  const commands: Commands = {
    ...actual,
    execute: nativeClaimBoundary(state, (recordRoot, args, cwd, timeout, capture) =>
      Effect.gen(function* () {
        if (args[0] === "bd") return yield* new BoundaryFailure({ message: "direct bd forbidden" })
        if (args[0] === "codex") {
          state.modelCalls++
          if (!cwd) return yield* new BoundaryFailure({ message: "missing exact model worktree" })
          yield* fs.writeFileString(join(cwd, "delivered.txt"), "delivered\n")
          yield* gitCall(["add", "delivered.txt"], cwd)
          yield* gitCall(["-c", "commit.gpgsign=false", "commit", "-m", "task"], cwd)
          return "controlled model receipt"
        }
        if (args[0] === "mise") return "controlled project qualification"
        if (args[0] === "gc") {
          // Tracker observations are native authority, not project-writer effects.
          // Keep mutations and Git commands on the guarded path below.
          if (operationalRead(args)) {
            const observed = yield* runCommand({
              executable: "env",
              args: [...env.slice(1), `GC_AGENT=fixture/dalph.${state.role}`, ...args],
              ...(cwd ? { cwd } : {}),
              timeout: timeout ?? Duration.seconds(30)
            }).pipe(
              Effect.mapError(
                (error) => new BoundaryFailure({ message: `native tracker observation failed: ${String(error)}` })
              )
            )
            return observed.stdout.trim()
          }
          if (args.includes("metadata-cas")) {
            state.casCalls++
            state.casKeys.push(args.find((arg) => arg.startsWith("--key=")) ?? "")
          }
          const text = yield* actual
            .execute(recordRoot, [...env, `GC_AGENT=fixture/dalph.${state.role}`, ...args], cwd, timeout, capture)
            .pipe(
              Effect.tapError((error) =>
                Effect.gen(function* () {
                  if (error._tag !== "BoundaryFailure") return
                  const path = error.message.match(/retain custody: (.+)$/)?.[1]
                  if (!path) return
                  const receipt = yield* fs
                    .readFileString(path)
                    .pipe(
                      Effect.flatMap(
                        Schema.decodeUnknownEffect(
                          Schema.fromJsonString(
                            Schema.Struct({ observation: Schema.Struct({ writer_pids: Schema.Array(Schema.Number) }) })
                          )
                        )
                      )
                    )
                  const writers = yield* Effect.forEach(receipt.observation.writer_pids, (pid) =>
                    Effect.gen(function* () {
                      const cmdline = yield* fs
                        .readFileString(`/proc/${pid}/cmdline`)
                        .pipe(Effect.catch(() => Effect.succeed("absent")))
                      const stat = yield* fs
                        .readFileString(`/proc/${pid}/stat`)
                        .pipe(Effect.catch(() => Effect.succeed("absent")))
                      return { pid, cmdline: cmdline.replaceAll("\0", " "), stat }
                    })
                  )
                  yield* fs.writeFileString(
                    join(root, "native-live-descendants.json"),
                    JSON.stringify({ receipt: path, writers })
                  )
                })
              )
            )
          if (args.includes("metadata-cas") && state.loseCas) {
            state.loseCas = false
            return yield* new CommandRejected({
              message: "lost applied CAS response",
              receipt: join(root, "lost-cas-response")
            })
          }
          return text
        }
        return yield* actual.execute(recordRoot, args, cwd, timeout, capture)
      })
    )
  }
  const tracker = makeTracker(config, commands)
  const git = makeGit(config, commands)
  const stages = makeStages(config, commands, tracker, git)
  const worktrees = makeWorktrees(config, commands, tracker, git)
  const workflow = makeWorkflow(config, commands, tracker, git, stages, worktrees)
  const turn = (role: "worker" | "integrator") => {
    state.role = role
    return workflow.run(role)
  }
  return { config, fs, gitCall, native, root, state, tracker, turn }
})
