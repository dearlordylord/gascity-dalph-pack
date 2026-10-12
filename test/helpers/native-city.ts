import { parse } from "smol-toml"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { Duration, Effect, FileSystem, Schema } from "effect"
import { makeCommands } from "../../src/delivery/command.ts"
import { BoundaryFailure } from "../../src/domain/shared.ts"
import { Bead } from "../../src/delivery/tracker.ts"
import { runCommand } from "../../src/quality/command.ts"

const port = Effect.tryPromise({
  try: () =>
    new Promise<number>((resolve, reject) => {
      const server = createServer()
      server.on("error", reject)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string") return server.close(() => reject(new Error("missing port")))
        server.close((error) => (error ? reject(error) : resolve(address.port)))
      })
    }),
  catch: (error) => new BoundaryFailure({ message: String(error) })
})

export const makeNativeCity = (fault: boolean | string = false) =>
  Effect.gen(function* () {
    const deliveryFaults = typeof fault === "boolean" && fault
    const reviewFault = typeof fault === "string" ? fault : "clean"
    const qualificationCut = reviewFault.startsWith("cut-")
    const fs = yield* FileSystem.FileSystem
    const commands = yield* makeCommands
    const root = yield* fs.makeTempDirectory({ prefix: "dalph-native-acceptance-" })
    yield* Effect.log(
      `Native acceptance evidence retained at ${root} (review=${reviewFault}, deliveryFaults=${deliveryFaults})`
    )
    const sourcePack = yield* fs.realPath(".")
    const pack = join(root, "pack")
    yield* fs.makeDirectory(pack)
    for (const relative of ["pack.toml", "package.json", "agents", "formulas", "dist", "trial"])
      yield* fs.copy(join(sourcePack, relative), join(pack, relative))
    yield* fs.symlink(join(sourcePack, "node_modules"), join(pack, "node_modules"))
    const apiPort = yield* port
    const repo = join(root, "target")
    const city = join(root, "city")
    const home = join(root, "home")
    yield* fs.makeDirectory(home, { recursive: true })
    yield* fs.makeDirectory(city, { recursive: true })
    yield* fs.makeDirectory(repo, { recursive: true })
    const tmux = yield* commands.execute(root, ["sh", "-c", "command -v tmux"])
    const tmuxRoot = dirname(dirname(yield* fs.realPath(tmux)))
    const lib = join(tmuxRoot, "lib", process.arch === "arm64" ? "aarch64-linux-gnu" : "x86_64-linux-gnu")
    const env = {
      GC_HOME: home,
      TMUX_TMPDIR: join(root, "tmux"),
      GC_BEADS: "bd",
      GC_BD_TRACE_JSON: join(root, "native-beads-trace.jsonl"),
      BD_DISABLE_METRICS: "1",
      DALPH_NATIVE_FIXTURE_DISTINCT: String(deliveryFaults),
      DALPH_NATIVE_REVIEW_FIXTURE: reviewFault,
      DOLT_ROOT_PATH: join(root, "dolt"),
      LD_LIBRARY_PATH: lib,
      DALPH_TRIAL_ROOT: root,
      DALPH_PACK_ROOT: pack,
      DALPH_CITY_ROOT: city,
      DALPH_CITY_NAME: "native-acceptance",
      DALPH_RIG: "fixture",
      DALPH_TARGET_REPO: repo,
      DALPH_WORKTREE_ROOT: join(root, "worktrees"),
      DALPH_TARGET_BRANCH: "master",
      DALPH_TRACKER_ENDPOINT: `http://127.0.0.1:${apiPort}`,
      DALPH_NATIVE_CONTRACT: join(root, "contract.json"),
      DALPH_NATIVE_TASK: "Implement the native fixture proof",
      DALPH_PROJECT_CONTRACT_PATH: join(pack, "trial/project-contract.md")
    }
    const execute = (args: ReadonlyArray<string>, cwd?: string, seconds = 60) =>
      runCommand({
        executable: "env",
        args: [...Object.entries(env).map(([key, value]) => `${key}=${value}`), ...args],
        ...(cwd ? { cwd } : {}),
        timeout: Duration.seconds(seconds)
      }).pipe(Effect.map((result) => result.stdout.trim()))
    const gc = (...args: string[]) => execute(["gc", "--city", city, "--rig", "fixture", ...args])
    const git = (...args: string[]) => execute(["git", "-C", repo, ...args])
    // Focused live runs must execute current source, even without a preceding build gate.
    yield* execute(
      [
        `${pack}/node_modules/.bin/esbuild`,
        "scripts/native.ts",
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        ...(qualificationCut ? ["--inject:./test/helpers/native-qualification-cut.ts"] : []),
        `--outfile=${pack}/dist/native.js`
      ],
      sourcePack
    )
    yield* execute(
      [
        `${pack}/node_modules/.bin/esbuild`,
        "trial/native-fixture.ts",
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        `--outfile=${pack}/dist/native-fixture.js`
      ],
      sourcePack
    )
    if (deliveryFaults)
      yield* execute(
        [
          `${pack}/node_modules/.bin/esbuild`,
          "trial/native-delivery-fixture.ts",
          "--bundle",
          "--platform=node",
          "--format=esm",
          "--packages=external",
          `--outfile=${pack}/dist/native-delivery-fixture.js`
        ],
        sourcePack
      )
    yield* git("init", "--initial-branch=master")
    yield* execute(["git", "init", "--bare", join(root, "remote.git")])
    yield* fs.writeFileString(
      join(repo, "check.test.mjs"),
      'import {test} from "node:test";import {existsSync,readFileSync} from "node:fs";import assert from "node:assert/strict";test("proof is exact when delivered",()=>{if(existsSync("native-proof.ts"))assert.equal(readFileSync("native-proof.ts","utf8"),\'export const delivered = "native"\\n\')})\n'
    )
    yield* git("add", ".")
    yield* git(
      "-c",
      "user.name=Native Acceptance",
      "-c",
      "user.email=native@local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "qualified Base"
    )
    yield* git("remote", "add", "origin", join(root, "remote.git"))
    yield* git("push", "-u", "origin", "master")
    yield* fs.writeFileString(
      join(home, "supervisor.toml"),
      `[supervisor]\nport = ${apiPort}\nallow_mutations = true\n`
    )
    const string = (value: string) => JSON.stringify(value)
    const baseline = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ orders: Schema.Struct({ skip: Schema.Array(Schema.String) }) })
    )(parse(yield* fs.readFileString(join(pack, "trial/city.toml"))))
    const skippedOrders = [...baseline.orders.skip]
    // Controlled workflow fixtures exclude unrelated patrols; production keeps these native defaults.
    if (reviewFault !== "installation")
      skippedOrders.push(
        "beads-health",
        "cascade-nudge-on-blocker-close",
        "cross-rig-deps",
        "dolt-health",
        "gate-sweep",
        "mol-dog-doctor",
        "mol-dog-phantom-db",
        "notify-on-human-gate-creation",
        "nudge-mail-sweep",
        "nudge-on-route",
        "order-tracking-sweep",
        "orphan-sweep",
        "renudge-stale-human-gates",
        "spawn-storm-detect"
      )
    const source = `[workspace]\nname = "native-acceptance"\nprovider = "fixture"\n[session]\nprovider = "tmux"\n[beads]\nprovider = "bd"\nconditional_writes = "require"\nguarded_release = "require"\n[providers.fixture]\ncommand = ${string(process.execPath)}\nargs = [${string(`${pack}/dist/native-fixture.js`)}]\nprompt_mode = "none"\nprocess_names = ["node"]\nready_delay_ms = 0\n[daemon]\npatrol_interval = "1s"\nmax_restarts = 0\n[api]\nallow_mutations = true\n[[rigs]]\nmax_active_sessions = 5\nname = "fixture"\npath = ${string(repo)}\ndefault_branch = "master"\n[rigs.imports.dalph]\nsource = ${string(pack)}\n[[patches.agent]]\nname = "bd.dog"\nsuspended = true\n[[patches.agent]]\nname = "native-worker"\nrig = "fixture"\nlifecycle = "one_shot"\nwork_dir = ${string(env.DALPH_WORKTREE_ROOT)}\n[[patches.agent]]\nname = "native-reviewer"\nrig = "fixture"\nlifecycle = "one_shot"\nwork_dir = ${string(env.DALPH_WORKTREE_ROOT)}\n[orders]\nskip = ${JSON.stringify(skippedOrders)}\n[workspace.env]\n${Object.entries(
      env
    )
      .map(([key, value]) => `${key} = ${string(value)}`)
      .join("\n")}\n`
    const deliveryPatch = deliveryFaults
      ? `\n[[patches.agent]]\nname = "fixture/dalph.native-prepare"\nmax_active_sessions = 2\n[[patches.agent]]\nname = "fixture/dalph.native-integrator"\nstart_command = ${string(`${process.execPath} ${pack}/dist/native-delivery-fixture.js`)}\n`
      : ""
    const template = join(root, "template.toml")
    const installedSource =
      reviewFault === "installation"
        ? source.replace('[[patches.agent]]\nname = "bd.dog"\nsuspended = true\n', "") +
          '\n[events.rotation]\nenabled = true\nmax_size_bytes = 268435456\narchive_retain_age = "720h"\n'
        : source
    yield* fs.writeFileString(template, installedSource + deliveryPatch)
    yield* fs.writeFileString(
      env.DALPH_NATIVE_CONTRACT,
      JSON.stringify({
        version: 1,
        agent: "fixture/dalph.native-worker",
        harness: "fixture",
        harnessVersion: process.version,
        runtime: "tmux",
        runtimeVersion: yield* execute(["tmux", "-V"]),
        readiness: [process.execPath, "-e", "process.exit(0)"],
        check: { command: [process.execPath, "--test"], timeoutSeconds: 5 }
      })
    )
    yield* fs.makeDirectory(env.TMUX_TMPDIR, { recursive: true })
    yield* fs.makeDirectory(env.DOLT_ROOT_PATH, { recursive: true })
    yield* execute(["dolt", "config", "--global", "--add", "user.name", "Native Acceptance"])
    yield* execute(["dolt", "config", "--global", "--add", "user.email", "native@local"])
    yield* execute([
      "gc",
      "init",
      city,
      "--name",
      env.DALPH_CITY_NAME,
      "--file",
      template,
      "--no-start",
      "--skip-provider-readiness",
      "--json"
    ])
    yield* Effect.acquireRelease(Effect.void, () =>
      Effect.gen(function* () {
        yield* execute(["gc", "--city", city, "stop"]).pipe(Effect.ignore)
        yield* execute(["gc", "supervisor", "stop"]).pipe(Effect.ignore)
      })
    )
    yield* execute(["gc", "start", city, "--json"], undefined, 120)
    // Tracker bootstrap is installation; qualify a clean project only after it completes.
    yield* git("rm", "--cached", "-r", "--ignore-unmatch", ".beads", ".gc")
    yield* fs.writeFileString(join(repo, ".gitignore"), ".beads*\n.gc/\n")
    yield* git("add", ".gitignore")
    yield* git(
      "-c",
      "user.name=Native Acceptance",
      "-c",
      "user.email=native@local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "qualify clean project after tracker bootstrap"
    )
    yield* git("push", "origin", "master")
    const rows = () =>
      execute([
        "env",
        "GC_NO_API=1",
        "gc",
        "--city",
        city,
        "--rig",
        "fixture",
        "beads",
        "list",
        "--all",
        "--format=json"
      ]).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Bead)))))
    // Resume reconciles the bounded history of earlier review batches through public session calls.
    const native = (...args: string[]) =>
      execute([process.execPath, `${pack}/dist/native.js`, ...args], undefined, args[0] === "resume" ? 180 : 60)
    // Gas City may stage its settings cache at the configured workspace root on restore.
    // Exact owned paths and native cleanup facts remain the resource authority.
    const worktreeEntries = () =>
      fs
        .readDirectory(env.DALPH_WORKTREE_ROOT)
        .pipe(Effect.map((entries) => entries.filter((entry) => entry !== ".gc")))
    return { root, fs, env, git, gc, native, rows, execute, worktreeEntries }
  })

export const nativeCity = makeNativeCity()
