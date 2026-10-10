import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const repo = resolve(process.argv[2])
const load = (name) => import(pathToFileURL(join(repo, "src", `${name}.mjs`)).href)
const { parseAmount, validateExpense } = await load("model")
const { aggregate } = await load("totals")
const { createReport } = await load("report")

assert.equal(parseAmount("0.29"), 29)
assert.equal(parseAmount("-2.34"), -234)
assert.throws(() => parseAmount("1.001"))
assert.throws(() => validateExpense({ date: "2023-02-29", description: "x", amount: "1", currency: "USD" }))

// A hand-calculated oracle, independent of implementation-generated expected
// values: 1234 - 234 = 1000 USD, and unlike currencies remain separate.
const expenses = [
  { date: "2024-02-29", description: "Lunch, cafe", amount: 1234, currency: "USD", category: "food" },
  { date: "2024-02-29", description: "REFUND lunch", amount: -234, currency: "USD", category: "food" },
  { date: "2024-03-01", description: "Train", amount: 750, currency: "EUR", category: "travel" },
  { date: "2024-03-01", description: "train", amount: 100, currency: "USD", category: "travel" },
  { date: "2024-03-02", description: "Other", amount: 1, currency: "CAD", category: "uncategorized" }
]
const totals = [
  { category: "food", currency: "USD", amount: 1000 },
  { category: "travel", currency: "EUR", amount: 750 },
  { category: "travel", currency: "USD", amount: 100 },
  { category: "uncategorized", currency: "CAD", amount: 1 }
]
assert.deepEqual(aggregate(expenses), totals)
assert.deepEqual(aggregate([...expenses].reverse()), totals)
assert.deepEqual(createReport(expenses), { count: 5, totals })

const { parseCsv } = await load("csv")
const { categorize } = await load("categories")
const csv = "date,description,amount,currency\r\n" +
  "2024-02-29,\"Lunch, cafe\",12.34,USD\r\n" +
  "2024-02-29,REFUND lunch,-2.34,USD\r\n" +
  "2024-03-01,Train,7.50,EUR\r\n" +
  "2024-03-01,train,1.00,USD\r\n" +
  "2024-03-02,Other,0.01,CAD\r\n"
const rules = [{ match: "lunch", category: "food" }, { match: "TRAIN", category: "travel" }]
assert.deepEqual(parseCsv(csv).map((expense) => categorize(expense, rules)), expenses)
assert.equal(categorize(expenses[0], [{ match: "lunch", category: "first" }, { match: "cafe", category: "second" }]).category, "first")

const directory = await mkdtemp(join(tmpdir(), "dalph-product-oracle-"))
try {
  const input = join(directory, "expenses.csv")
  const ruleFile = join(directory, "rules.json")
  await writeFile(input, csv)
  await writeFile(ruleFile, JSON.stringify(rules))
  const invoke = (...args) => spawnSync(process.execPath, [join(repo, "bin/expenses.mjs"), input, "--rules", ruleFile, ...args], { encoding: "utf8", timeout: 5000 })
  const first = invoke("--json")
  assert.equal(first.status, 0, first.stderr)
  assert.deepEqual(JSON.parse(first.stdout), { count: 5, totals })
  const second = invoke("--json")
  assert.equal(second.status, 0, second.stderr)
  assert.equal(second.stdout, first.stdout)
  const human = invoke()
  assert.equal(human.status, 0, human.stderr)
  for (const word of ["food", "travel", "uncategorized", "USD", "EUR", "CAD"]) assert.ok(human.stdout.includes(word), word)
  await writeFile(input, "date,description,amount,currency\n2024-02-29,\"unterminated,1.00,USD\n")
  const invalid = invoke("--json")
  assert.notEqual(invalid.status, 0)
  assert.ok(invalid.stderr.trim().length > 0)
  assert.equal(invalid.stdout, "")
  assert.ok((await readFile(join(repo, "README.md"), "utf8")).includes("--json"))
  console.log("Independent product oracle passed: exact money, categories, mixed currencies, deterministic CLI JSON/human output, input rejection and usage docs.")
} finally {
  await rm(directory, { recursive: true })
}
