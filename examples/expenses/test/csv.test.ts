import assert from "node:assert/strict"
import test from "node:test"

import { parseCsv } from "../src/csv.ts"

test("parseCsv handles reordered headers, CRLF, quoted commas, escaped quotes, and multiline fields", () => {
  const csv = [
    "currency,description,date,amount",
    'CAD,"Coffee, ""Croissant""",2025-01-02,4.75',
    'USD,"Client lunch\r\nwith the team",2025-01-03,28.5',
    ""
  ].join("\r\n")

  assert.deepEqual(parseCsv(csv), [
    { date: "2025-01-02", description: 'Coffee, "Croissant"', amount: 475, currency: "CAD" },
    { date: "2025-01-03", description: "Client lunch\r\nwith the team", amount: 2850, currency: "USD" }
  ])
})

test("parseCsv accepts LF, a UTF-8 BOM, and a final newline", () => {
  assert.deepEqual(parseCsv("\uFEFFdate,description,amount,currency\n2025-03-04,Bus fare,2.5,CAD\n"), [
    { date: "2025-03-04", description: "Bus fare", amount: 250, currency: "CAD" }
  ])
})

test("parseCsv requires each of the four headers exactly once", () => {
  for (const csv of [
    "",
    "date,description,amount\n",
    "date,description,amount,currency,currency\n",
    "date,description,amount,merchant\n",
    "date,date,amount,currency\n"
  ]) {
    assert.throws(() => parseCsv(csv), TypeError, `expected invalid header in ${JSON.stringify(csv)}`)
  }
})

test("parseCsv rejects malformed quoting and rows with the wrong number of columns", () => {
  const header = "date,description,amount,currency\n"

  for (const row of [
    '2025-01-01,"unterminated,1.00,CAD',
    '2025-01-01,un"escaped,1.00,CAD',
    '2025-01-01,"closed" trailing,1.00,CAD',
    "2025-01-01,Lunch,1.00",
    "2025-01-01,Lunch,1.00,CAD,extra"
  ]) {
    assert.throws(() => parseCsv(header + row), TypeError, `expected malformed row ${JSON.stringify(row)}`)
  }
})

test("parseCsv validates each row with the expense model", () => {
  const header = "date,description,amount,currency\n"

  assert.throws(() => parseCsv(header + "2025-02-30,Lunch,1.00,CAD"), /CSV row 2: date/)
  assert.throws(() => parseCsv(header + "2025-02-28,Lunch,1.234,CAD"), /CSV row 2: amount/)
  assert.throws(() => parseCsv(header + "2025-02-28,   ,1.00,CAD"), /CSV row 2: description/)
})

test("parseCsv requires a string input", () => {
  assert.throws(() => parseCsv(null), TypeError)
})
