import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Console, Duration, Effect, FileSystem, Schema } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { BoundaryFailure } from "../src/domain/shared.ts"
import { runCommand } from "../src/quality/command.ts"

const ORACLE_TIMEOUT_SECONDS = 5

// This oracle uses hand-calculated expectations and invokes the selected target's CLI.
const main = Effect.scoped(
  Effect.gen(function* () {
    const repo = yield* Schema.decodeUnknownEffect(AbsolutePath)(process.argv[2])
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "dalph-product-oracle-" })
    const input = join(directory, "expenses.csv")
    const rules = join(directory, "rules.json")
    const csv =
      'date,description,amount,currency\r\n2024-02-29,"Lunch, cafe",12.34,USD\r\n2024-02-29,REFUND lunch,-2.34,USD\r\n2024-03-01,Train,7.50,EUR\r\n2024-03-01,train,1.00,USD\r\n2024-03-02,Other,0.01,CAD\r\n'
    yield* Effect.tryPromise(() => writeFile(input, csv))
    yield* Effect.tryPromise(() =>
      writeFile(
        rules,
        JSON.stringify([
          { match: "lunch", category: "food" },
          { match: "TRAIN", category: "travel" }
        ])
      )
    )
    const invoke = (args: ReadonlyArray<string>) =>
      runCommand({
        executable: process.execPath,
        args: [join(repo, "bin/expenses.ts"), input, "--rules", rules, ...args],
        timeout: Duration.seconds(ORACLE_TIMEOUT_SECONDS)
      })
    const first = yield* invoke(["--json"])
    const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.JsonObject))(first.stdout)
    const second = yield* invoke(["--json"])
    const human = yield* invoke([])
    const readme = yield* Effect.tryPromise(() => readFile(join(repo, "README.md"), "utf8"))
    yield* Effect.try({
      try: () => {
        assert.deepEqual(parsed, {
          count: 5,
          totals: [
            { category: "food", currency: "USD", amount: 1000 },
            { category: "travel", currency: "EUR", amount: 750 },
            { category: "travel", currency: "USD", amount: 100 },
            { category: "uncategorized", currency: "CAD", amount: 1 }
          ]
        })
        assert.equal(second.stdout, first.stdout)
        for (const word of ["food", "travel", "uncategorized", "USD", "EUR", "CAD"])
          assert.ok(human.stdout.includes(word))
        assert.ok(readme.includes("--json"))
      },
      catch: (error) => new BoundaryFailure({ message: `Product oracle failed: ${String(error)}` })
    })
    yield* Effect.tryPromise(() =>
      writeFile(input, 'date,description,amount,currency\n2024-02-29,"unterminated,1.00,USD\n')
    )
    const failure = yield* Effect.flip(invoke(["--json"]))
    yield* Effect.try({
      try: () => {
        assert.equal(failure._tag, "CommandFailure")
        if (failure._tag === "CommandFailure") {
          assert.notEqual(failure.exit, 0)
          assert.equal(failure.stdout, "")
          assert.ok(failure.stderr?.trim())
        }
      },
      catch: (error) => new BoundaryFailure({ message: `Input rejection oracle failed: ${String(error)}` })
    })
    yield* Console.log(
      "Independent CLI oracle passed: exact money, categories, mixed currencies, deterministic output, input rejection and usage docs"
    )
  })
)
NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
