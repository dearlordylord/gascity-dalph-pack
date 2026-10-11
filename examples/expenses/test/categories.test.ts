import assert from "node:assert/strict"
import test from "node:test"

import { categorize } from "../src/categories.ts"

test("categorize matches description substrings without regard to case", () => {
  const expense = { date: "2024-05-01", description: "Coffee at NORTHSTAR CAFE", amount: 575, currency: "CAD" }

  assert.deepEqual(categorize(expense, [{ match: "NorthStar", category: "coffee" }]), {
    ...expense,
    category: "coffee"
  })
})

test("categorize uses the first matching rule", () => {
  const expense = { description: "Office supply store", amount: 2400, currency: "USD" }
  const rules = [
    { match: "office", category: "work" },
    { match: "supply", category: "shopping" }
  ]

  assert.equal(categorize(expense, rules).category, "work")
})

test("categorize returns uncategorized when no rule matches", () => {
  const expense = { description: "Monthly rent", amount: 120000, currency: "USD" }

  assert.deepEqual(categorize(expense, [{ match: "grocery", category: "food" }]), {
    ...expense,
    category: "uncategorized"
  })
  assert.equal(categorize(expense, []).category, "uncategorized")
})

test("categorize does not mutate the expense", () => {
  const expense = { description: "Bus fare", amount: 325, currency: "CAD" }
  const original = { ...expense }

  categorize(expense, [{ match: "bus", category: "transport" }])

  assert.deepEqual(expense, original)
})
