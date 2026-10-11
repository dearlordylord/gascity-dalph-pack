import assert from "node:assert/strict"
import test from "node:test"

import { formatAmount } from "../src/format-amount.ts"

test("formatAmount renders minor units with exactly two fractional digits", () => {
  assert.equal(formatAmount(0), "0.00")
  assert.equal(formatAmount(1), "0.01")
  assert.equal(formatAmount(-1), "-0.01")
  assert.equal(formatAmount(12345), "123.45")
  assert.equal(formatAmount(-12345), "-123.45")
  assert.equal(formatAmount(10), "0.10")
  assert.equal(formatAmount(100), "1.00")
})

test("formatAmount preserves exact values at both safe integer limits", () => {
  assert.equal(formatAmount(Number.MAX_SAFE_INTEGER), "90071992547409.91")
  assert.equal(formatAmount(Number.MIN_SAFE_INTEGER), "-90071992547409.91")
  assert.equal(formatAmount(Number.MAX_SAFE_INTEGER - 1), "90071992547409.90")
  assert.equal(formatAmount(Number.MIN_SAFE_INTEGER + 1), "-90071992547409.90")
})

test("formatAmount rejects inputs that are not safe integer numbers", () => {
  for (const amount of [
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
    NaN,
    Infinity,
    -Infinity,
    "100",
    100n,
    null,
    undefined
  ]) {
    assert.throws(() => formatAmount(amount), TypeError, `expected ${String(amount)} to be rejected`)
  }
})
