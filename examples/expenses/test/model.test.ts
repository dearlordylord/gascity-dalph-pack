import assert from "node:assert/strict"
import test from "node:test"

import { parseAmount, validateExpense } from "../src/model.ts"

test("parseAmount converts decimal strings to exact minor units", () => {
  assert.equal(parseAmount("0"), 0)
  assert.equal(parseAmount("1"), 100)
  assert.equal(parseAmount("12.3"), 1230)
  assert.equal(parseAmount("12.34"), 1234)
  assert.equal(parseAmount("0.01"), 1)
  assert.equal(parseAmount("-12.34"), -1234)
})

test("parseAmount rejects non-decimal and over-precision values", () => {
  for (const value of ["", " 1.00", "1.00 ", "1.00\n", ".50", "1.", "+1.00", "1.234", "1e2", "$1.00"]) {
    assert.throws(() => parseAmount(value), TypeError, `expected ${JSON.stringify(value)} to be rejected`)
  }
  assert.throws(() => parseAmount(1.25), TypeError)
  assert.throws(() => parseAmount("90071992547409.92"), RangeError)
})

test("validateExpense returns the validated expense with amount in minor units", () => {
  const input = {
    date: "2024-02-29",
    description: "  Train ticket  ",
    amount: "18.75",
    currency: "CAD",
    ignored: "extra field"
  }

  assert.deepEqual(validateExpense(input), {
    date: "2024-02-29",
    description: "  Train ticket  ",
    amount: 1875,
    currency: "CAD"
  })
  assert.equal(input.amount, "18.75", "validation does not mutate the input")
})

test("validateExpense rejects malformed and impossible dates", () => {
  const valid = { date: "2024-01-31", description: "Lunch", amount: "9.99", currency: "USD" }

  for (const date of [
    "2024-1-31",
    "2024/01/31",
    "2023-02-29",
    "2024-04-31",
    "0000-01-01",
    " 2024-01-31",
    "2024-01-31\n"
  ]) {
    assert.throws(() => validateExpense({ ...valid, date }), TypeError, `expected ${date} to be rejected`)
  }
})

test("validateExpense requires a nonblank description and uppercase three-letter currency", () => {
  const valid = { date: "2024-01-31", description: "Lunch", amount: "9.99", currency: "USD" }

  for (const description of ["", "   ", null, 42]) {
    assert.throws(() => validateExpense({ ...valid, description }), TypeError)
  }
  for (const currency of ["usd", "US", "USDD", "U$D", " USD", "USD\n", null]) {
    assert.throws(() => validateExpense({ ...valid, currency }), TypeError)
  }
  for (const record of [null, [], "expense"]) {
    assert.throws(() => validateExpense(record), TypeError)
  }
})
