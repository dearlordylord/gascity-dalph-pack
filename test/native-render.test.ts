import { Duration, Effect, FileSystem, Schema } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { parse } from "smol-toml"
import { runCommand } from "../src/quality/command.ts"

it.live(
  "native setup rendering retains complete runtime configuration and repeats without filesystem mutation",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "dalph-render-" })
      const pack = yield* fs.realPath(".")
      const environment = {
        DALPH_TRIAL_ROOT: root,
        DALPH_CITY_NAME: "render-city",
        DALPH_RIG: "project",
        DALPH_TARGET_BRANCH: "master",
        DALPH_TARGET_REPO: `${root}/target with spaces`,
        DALPH_PACK_ROOT: pack,
        DALPH_WORKTREE_ROOT: `${root}/worktrees`,
        DALPH_CITY_ROOT: `${root}/city`,
        DALPH_TRACKER_ENDPOINT: "http://127.0.0.1:8372",
        DALPH_NATIVE_CONTRACT: `${root}/native-contract.json`,
        DALPH_PROJECT_CONTRACT_PATH: `${root}/project-contract.md`,
        GC_HOME: `${root}/home`,
        DOLT_ROOT_PATH: `${root}/dolt`,
        TMUX_TMPDIR: `${root}/tmux`,
        GC_BEADS_PROXIED_NATIVE: "1",
        GC_BEADS_PROXIED_IDLE_TIMEOUT: "0"
      }
      const render = runCommand({
        executable: "env",
        args: [
          ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
          process.execPath,
          `${pack}/node_modules/tsx/dist/cli.mjs`,
          "scripts/render-city.ts"
        ],
        cwd: pack,
        timeout: Duration.seconds(10)
      })
      const first = yield* render
      expect((yield* render).stdout).toBe(first.stdout)
      const parsed = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          workspace: Schema.Struct({ env: Schema.Record(Schema.String, Schema.String) }),
          rigs: Schema.Array(Schema.Struct({ max_active_sessions: Schema.Number }))
        })
      )(parse(first.stdout))
      expect(parsed.workspace.env).toEqual(environment)
      expect(parsed.rigs[0]?.max_active_sessions).toBe(5)
      expect(yield* fs.readDirectory(root)).toEqual([])
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  30000
)
