import { Duration, Effect, FileSystem, Schema } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { parse } from "smol-toml"
import { runCommand } from "../src/quality/command.ts"

const Query = Schema.Struct({ work_query: Schema.String })
const Response = Schema.Struct({ args: Schema.Array(Schema.String), output: Schema.String, fail: Schema.Boolean })

it.live(
  "native worker and reviewer discovery scopes workspaces without losing assigned recovery",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "dalph-query-" })
      const pack = yield* fs.realPath(".")
      const helper = `${root}/native-ready-port.mjs`
      // Bundle the controlled command port once; every public-query subprocess stays small.
      yield* runCommand({
        executable: `${pack}/node_modules/esbuild/bin/esbuild`,
        args: [
          `${pack}/test/helpers/native-ready-port.ts`,
          "--bundle",
          "--platform=node",
          "--format=esm",
          `--outfile=${helper}`
        ],
        cwd: pack,
        timeout: Duration.seconds(5)
      })
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
      yield* fs.writeFileString(`${root}/gc`, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(helper)} "$@"\n`)
      yield* fs.chmod(`${root}/gc`, 0o700)
      let previous: string | undefined
      for (const role of ["native-worker", "native-reviewer"]) {
        const config = yield* fs.readFileString(`${pack}/agents/${role}/agent.toml`)
        const { work_query } = yield* Schema.decodeUnknownEffect(Query)(parse(config))
        if (previous) expect(work_query).toBe(previous)
        previous = work_query
        yield* Effect.forEach(
          [
            "A",
            "B",
            "controller",
            "recovery",
            "assigned-ready",
            "blocked",
            "failure",
            "empty",
            "missing-dir",
            "missing-template"
          ] as const,
          (mode) =>
            Effect.gen(function* () {
              const controller = mode === "controller"
              const template = `fixture/dalph.${role}`
              const workspace = mode === "B" ? "work-B" : "work-A"
              const prefix = [
                "ready",
                "--metadata-field",
                `gc.routed_to=${template}`,
                ...(controller ? [] : ["--metadata-field", `gc.pack_workspace=${workspace}`]),
                "--exclude-type=epic",
                "--sort",
                "oldest",
                "--limit",
                "20",
                "--json"
              ]
              const suffix =
                mode === "recovery"
                  ? ["--status", "in_progress", "--assignee", "alias"]
                  : mode === "assigned-ready"
                    ? ["--assignee", "seat"]
                    : ["--unassigned"]
              // Recovery has no gc.session_id stamp; native adoption must be able to discover its assignee.
              const selected = [
                {
                  id: mode === "recovery" ? "owned-without-stamp" : workspace,
                  metadata: { "gc.pack_workspace": workspace }
                }
              ]
              const output = controller
                ? JSON.stringify([{ id: "work-A" }, { id: "work-B" }])
                : JSON.stringify(selected)
              const path = `${root}/${role}-${mode}.json`
              const responses = [
                Schema.decodeUnknownSync(Response)({
                  args: [...prefix, ...suffix],
                  output: mode === "empty" ? "" : output,
                  fail: mode === "failure"
                })
              ]
              if (mode === "blocked")
                responses.unshift({
                  args: [...prefix, "--status", "in_progress", "--assignee", "seat"],
                  output: JSON.stringify([{ id: "blocked", blocked_by: ["dependency"] }]),
                  fail: false
                })
              yield* fs.writeFileString(path, JSON.stringify({ prefix, responses }))
              const invocation = runCommand({
                executable: "env",
                args: [
                  `PATH=${root}:/usr/bin:/bin`,
                  `DALPH_READY_PORT=${path}`,
                  `GC_TEMPLATE=${mode === "missing-template" ? "" : template}`,
                  `GC_SESSION_ID=${controller ? "" : "seat"}`,
                  "GC_SESSION_NAME=",
                  `GC_ALIAS=${mode === "recovery" ? "alias" : ""}`,
                  `GC_DIR=${mode === "missing-dir" ? "" : `${root}/directory with spaces/${workspace}/`}`,
                  "/bin/sh",
                  "-c",
                  work_query
                ],
                cwd: root,
                timeout: Duration.seconds(5)
              })
              if (["failure", "empty", "missing-dir", "missing-template"].includes(mode)) {
                yield* Effect.flip(invocation)
                if (mode === "missing-dir" || mode === "missing-template")
                  expect(yield* fs.exists(`${path}.trace`)).toBe(false)
              } else {
                const actual = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.Unknown)))(
                  (yield* invocation).stdout
                )
                expect(actual).toEqual([
                  ...(mode === "blocked" ? [{ id: "blocked", blocked_by: ["dependency"] }] : []),
                  ...Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.Unknown)))(output)
                ])
                const calls = (yield* fs.readFileString(`${path}.trace`))
                  .trim()
                  .split("\n")
                  .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.String)))(line))
                expect(calls).toContainEqual([...prefix, ...suffix])
                expect(calls.at(-1)).toEqual([...prefix, "--unassigned"])
                expect(calls.every((args) => args[0] === "ready")).toBe(true)
                if (mode === "recovery") expect(calls[0]).toContain("seat")
                if (mode === "assigned-ready") expect(calls[0]).toContain("in_progress")
              }
            }),
          { concurrency: 2 }
        )
      }
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  15000
)
