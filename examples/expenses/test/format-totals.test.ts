import assert from "node:assert/strict"
import test from "node:test"

import { formatTotals } from "../src/format-totals.ts"

test("formatTotals renders totals in input order with their own currencies", () => {
  assert.deepEqual(
    formatTotals([
      { category: "transport", currency: "CAD", amount: 1250 },
      { category: "food", currency: "USD", amount: 123 },
      { category: "food", currency: "CAD", amount: 825 }
    ]),
    ["transport | CAD | 12.50", "food | USD | 1.23", "food | CAD | 8.25"]
  )
})

test("formatTotals preserves negative amounts", () => {
  assert.deepEqual(formatTotals([{ category: "refund", currency: "USD", amount: -123 }]), ["refund | USD | -1.23"])
})

test("formatTotals returns an empty array for no totals", () => {
  assert.deepEqual(formatTotals([]), [])
})

test("formatTotals does not mutate the input array or records", () => {
  const totals = [
    { category: "food", currency: "USD", amount: 123 },
    { category: "transport", currency: "CAD", amount: -50 }
  ]
  const original = structuredClone(totals)

  formatTotals(totals)

  assert.deepEqual(totals, original)
})
