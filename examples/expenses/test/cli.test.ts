import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const CLI_PATH = fileURLToPath(new URL("../bin/expenses.ts", import.meta.url))
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url)
const EXPENSES_PATH = fileURLToPath(new URL("expenses.csv", FIXTURE_DIR))
const RULES_PATH = fileURLToPath(new URL("rules.json", FIXTURE_DIR))
const MALFORMED_CSV_PATH = fileURLToPath(new URL("malformed.csv", FIXTURE_DIR))

function createFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "expenses-cli-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  return {
    directory,
    write(name, contents) {
      const filePath = path.join(directory, name)
      writeFileSync(filePath, contents)
      return filePath
    },
    run(args) {
      return spawnSync(CLI_PATH, args, { cwd: directory, encoding: "utf8", timeout: 5_000 })
    }
  }
}

test("executable CLI prints categorized human totals in minor units", (t) => {
  const fixture = createFixture(t)
  const result = fixture.run([EXPENSES_PATH, "--rules", RULES_PATH])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, "")
  assert.equal(
    result.stdout,
    "5 expenses\n" +
      "Totals by category and currency:\n" +
      "food | CAD -1.50\n" +
      "food | USD 12.50\n" +
      "transport | CAD 2.50\n" +
      "uncategorized | CAD 8.00\n"
  )
})

test("executable CLI emits deterministic report JSON for mixed currencies and categories", (t) => {
  const fixture = createFixture(t)
  const source = readFileSync(EXPENSES_PATH, "utf8").trimEnd().split("\n")
  const reversedPath = fixture.write(
    "expenses-reversed.csv",
    [source[0], ...source.slice(1).reverse()].join("\n") + "\n"
  )
  const expected = {
    count: 5,
    totals: [
      { category: "food", currency: "CAD", amount: -150 },
      { category: "food", currency: "USD", amount: 1250 },
      { category: "transport", currency: "CAD", amount: 250 },
      { category: "uncategorized", currency: "CAD", amount: 800 }
    ]
  }

  const first = fixture.run(["--json", EXPENSES_PATH, "--rules", RULES_PATH])
  const reversed = fixture.run([reversedPath, "--rules", RULES_PATH, "--json"])

  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.stderr, "")
  assert.equal(reversed.status, 0, reversed.stderr)
  assert.equal(reversed.stderr, "")
  assert.equal(first.stdout, `${JSON.stringify(expected, null, 2)}\n`)
  assert.equal(reversed.stdout, first.stdout)
  assert.deepEqual(JSON.parse(first.stdout), expected)
})

test("CLI defaults to uncategorized totals when no rules file is supplied", (t) => {
  const fixture = createFixture(t)
  const csvPath = fixture.write("expenses.csv", "date,description,amount,currency\n2025-02-01,Monthly rent,1200,USD\n")

  const result = fixture.run([csvPath, "--json"])

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    count: 1,
    totals: [{ category: "uncategorized", currency: "USD", amount: 120000 }]
  })
})

test("CLI prints an empty report when the CSV contains only its header", (t) => {
  const fixture = createFixture(t)
  const csvPath = fixture.write("empty.csv", "date,description,amount,currency\n")

  const result = fixture.run([csvPath])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "0 expenses\nNo totals.\n")
})

test("CLI reports usage and unreadable or invalid input to stderr with a nonzero status", (t) => {
  const fixture = createFixture(t)
  const missingPath = path.join(fixture.directory, "missing.csv")
  const badCsvPath = fixture.write("bad.csv", "date,description,amount,currency\ninvalid row\n")

  const missingArgument = fixture.run([])
  assert.notEqual(missingArgument.status, 0)
  assert.match(missingArgument.stderr, /Missing CSV path\. Usage:/)
  assert.equal(missingArgument.stdout, "")

  const unreadableFile = fixture.run([missingPath])
  assert.notEqual(unreadableFile.status, 0)
  assert.match(unreadableFile.stderr, /Unable to read CSV file .*missing\.csv/)

  const invalidCsv = fixture.run([badCsvPath])
  assert.notEqual(invalidCsv.status, 0)
  assert.match(invalidCsv.stderr, /CSV row 2 must have 4 columns/)
  assert.equal(invalidCsv.stdout, "")
})

test("CLI rejects malformed CSV quoting without printing a partial report", (t) => {
  const fixture = createFixture(t)

  const result = fixture.run([MALFORMED_CSV_PATH, "--json"])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /CSV contains an unterminated quoted field/)
  assert.equal(result.stdout, "")
})

test("CLI rejects malformed rules JSON and rules with the wrong shape", (t) => {
  const fixture = createFixture(t)
  const csvPath = fixture.write("expenses.csv", "date,description,amount,currency\n2025-01-02,Coffee,4.75,CAD\n")
  const malformedPath = fixture.write("malformed.json", "[{]")
  const wrongShapePath = fixture.write("wrong-shape.json", JSON.stringify([{ match: "coffee" }]))

  const malformed = fixture.run([csvPath, "--rules", malformedPath])
  assert.notEqual(malformed.status, 0)
  assert.match(malformed.stderr, /Rules file is not valid JSON/)
  assert.equal(malformed.stdout, "")

  const wrongShape = fixture.run([csvPath, "--rules", wrongShapePath])
  assert.notEqual(wrongShape.status, 0)
  assert.match(wrongShape.stderr, /Rules entry 1 must have string match and category fields/)
  assert.equal(wrongShape.stdout, "")
})

test("CLI rejects unknown options", (t) => {
  const fixture = createFixture(t)

  const result = fixture.run(["--wat"])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unknown option: --wat/)
  assert.equal(result.stdout, "")
})
