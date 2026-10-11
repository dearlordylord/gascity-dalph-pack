import assert from "node:assert/strict"
import test from "node:test"

import { createReport } from "../src/report.ts"
import { renderReportText } from "../src/report-text.ts"

test("renderReportText formats a report created from expenses without mutation", () => {
  const expenses = [
    { category: "food", currency: "USD", amount: 123 },
    { category: "travel", currency: "EUR", amount: -50 }
  ]
  const expensesBefore = structuredClone(expenses)
  const report = createReport(expenses)
  const reportBefore = structuredClone(report)

  assert.equal(renderReportText(report), "2 expenses\nfood | USD | 1.23\ntravel | EUR | -0.50")
  assert.deepEqual(report, reportBefore)
  assert.deepEqual(expenses, expensesBefore)
})

test("renderReportText renders an empty report without a trailing newline", () => {
  assert.equal(renderReportText(createReport([])), "0 expenses")
})
