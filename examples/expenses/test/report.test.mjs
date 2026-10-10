import assert from "node:assert/strict";
import test from "node:test";

import { createReport } from "../src/report.mjs";

test("createReport includes the expense count and category currency totals", () => {
  const expenses = [
    { category: "transport", currency: "CAD", amount: 1250 },
    { category: "food", currency: "USD", amount: 250 },
    { category: "food", currency: "CAD", amount: 825 },
    { category: "food", currency: "USD", amount: 50 },
  ];

  assert.deepEqual(createReport(expenses), {
    count: 4,
    totals: [
      { category: "food", currency: "CAD", amount: 825 },
      { category: "food", currency: "USD", amount: 300 },
      { category: "transport", currency: "CAD", amount: 1250 },
    ],
  });
});

test("createReport is deterministic across expense order and JSON-compatible", () => {
  const expenses = [
    { category: "zeta", currency: "USD", amount: 5 },
    { category: "alpha", currency: "JPY", amount: 7 },
    { category: "alpha", currency: "CAD", amount: 11 },
  ];

  const report = createReport(expenses);
  const reversedReport = createReport([...expenses].reverse());
  const expected = {
    count: 3,
    totals: [
      { category: "alpha", currency: "CAD", amount: 11 },
      { category: "alpha", currency: "JPY", amount: 7 },
      { category: "zeta", currency: "USD", amount: 5 },
    ],
  };

  assert.deepEqual(report, expected);
  assert.deepEqual(reversedReport, expected);
  assert.equal(JSON.stringify(reversedReport), JSON.stringify(report));
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("createReport handles empty input and does not mutate expenses", () => {
  assert.deepEqual(createReport([]), { count: 0, totals: [] });

  const expense = { category: "food", currency: "CAD", amount: 100 };
  const input = [expense];
  createReport(input);
  assert.deepEqual(input, [expense]);
});

test("createReport rejects invalid expenses using aggregate validation", () => {
  assert.throws(() => createReport(null), TypeError);
  assert.throws(() => createReport([{ category: "food", currency: "cad", amount: 100 }]), TypeError);
});
