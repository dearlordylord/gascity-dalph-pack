import { join } from "node:path"
import { Duration, Effect, FileSystem } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { runCommand } from "../src/quality/command.ts"

for (const fault of ["read", "contract", "identity"]) {
  it.live(`native gate ${fault} failure refuses before semantic evaluation`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const bin = join(root, "bin")
      yield* fs.makeDirectory(bin)
      yield* fs.writeFileString(
        join(bin, "gc"),
        '#!/bin/sh\nprintf "read\\n" >> "$DALPH_TRIAL_ROOT/calls"\nprintf "native read unavailable\\n" >&2\nexit 1\n',
        { mode: 0o700 }
      )
      const contract = join(root, "contract.json")
      yield* fs.writeFileString(
        contract,
        JSON.stringify({
          version: 1,
          agent: "fixture/worker",
          harness: "fixture",
          harnessVersion: "fixture",
          runtime: "tmux",
          runtimeVersion: "fixture",
          readiness: [process.execPath, "--version"],
          check: { command: [process.execPath, "--test"], timeoutSeconds: 5 }
        })
      )
      const script = join(root, "native.mjs")
      yield* runCommand({
        executable: "node_modules/.bin/esbuild",
        args: [
          "scripts/native.ts",
          "--bundle",
          "--platform=node",
          "--format=esm",
          '--banner:js=import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
          `--outfile=${script}`
        ],
        timeout: Duration.seconds(10)
      })
      const environment = {
        PATH: `${bin}:${process.env.PATH}`,
        DALPH_TRIAL_ROOT: root,
        DALPH_PACK_ROOT: root,
        DALPH_CITY_ROOT: root,
        DALPH_CITY_NAME: "fixture",
        DALPH_RIG: "fixture",
        DALPH_TARGET_REPO: root,
        DALPH_WORKTREE_ROOT: root,
        DALPH_TARGET_BRANCH: "master",
        DALPH_TRACKER_ENDPOINT: "http://127.0.0.1:1",
        DALPH_NATIVE_CONTRACT: contract,
        DALPH_PROJECT_CONTRACT_PATH: contract,
        GC_BEAD_ID: "control"
      }
      if (fault === "contract") environment.DALPH_NATIVE_CONTRACT = join(root, "missing.json")
      if (fault === "identity") environment.GC_BEAD_ID = ""
      const failure = yield* Effect.flip(
        runCommand({
          executable: "env",
          args: [
            ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
            process.execPath,
            script,
            "review-gate"
          ],
          timeout: Duration.seconds(10)
        })
      )
      expect(failure._tag).toBe("CommandFailure")
      if (failure._tag === "CommandFailure") {
        expect(failure.exit).toBe(75)
        expect(`${failure.stdout}${failure.stderr}`).toContain(
          fault === "read" ? "CommandRejected" : fault === "contract" ? "NotFound" : "ConfigError"
        )
      }
      if (fault === "read") expect(yield* fs.readFileString(join(root, "calls"))).toBe("read\n")
      else expect(yield* fs.exists(join(root, "calls"))).toBe(false)
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  )
}
