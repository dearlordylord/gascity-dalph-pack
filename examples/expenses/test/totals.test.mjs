import assert from "node:assert/strict";
import test from "node:test";

import { aggregate } from "../src/totals.mjs";

test("aggregate totals integer minor units by category and currency", () => {
  const expenses = [
    { category: "transport", currency: "CAD", amount: 1250 },
    { category: "food", currency: "USD", amount: 250 },
    { category: "food", currency: "CAD", amount: 825 },
    { category: "food", currency: "USD", amount: 50 },
    { category: "transport", currency: "USD", amount: 500 },
  ];

  assert.deepEqual(aggregate(expenses), [
    { category: "food", currency: "CAD", amount: 825 },
    { category: "food", currency: "USD", amount: 300 },
    { category: "transport", currency: "CAD", amount: 1250 },
    { category: "transport", currency: "USD", amount: 500 },
  ]);
});

test("aggregate output ordering does not depend on expense order", () => {
  const expenses = [
    { category: "zeta", currency: "USD", amount: 5 },
    { category: "alpha", currency: "JPY", amount: 7 },
    { category: "alpha", currency: "CAD", amount: 11 },
  ];

  const expected = [
    { category: "alpha", currency: "CAD", amount: 11 },
    { category: "alpha", currency: "JPY", amount: 7 },
    { category: "zeta", currency: "USD", amount: 5 },
  ];

  assert.deepEqual(aggregate(expenses), expected);
  assert.deepEqual(aggregate([...expenses].reverse()), expected);
});

test("aggregate preserves signed totals and safely handles special category keys", () => {
  const result = aggregate([
    { category: "__proto__", currency: "CAD", amount: -125 },
    { category: "__proto__", currency: "CAD", amount: 25 },
    { category: "__proto__", currency: "USD", amount: 0 },
    { category: "constructor", currency: "CAD", amount: -10 },
  ]);

  assert.deepEqual(result, [
    { category: "__proto__", currency: "CAD", amount: -100 },
    { category: "__proto__", currency: "USD", amount: 0 },
    { category: "constructor", currency: "CAD", amount: -10 },
  ]);
});

test("aggregate returns an empty array for no expenses and does not mutate input", () => {
  assert.deepEqual(aggregate([]), []);

  const expense = { category: "food", currency: "CAD", amount: 1 };
  aggregate([expense]);
  assert.deepEqual(expense, { category: "food", currency: "CAD", amount: 1 });
});

test("aggregate adds exact integers even when intermediate sums leave the safe range", () => {
  const result = aggregate([
    { category: "edge", currency: "CAD", amount: Number.MAX_SAFE_INTEGER },
    { category: "edge", currency: "CAD", amount: 2 },
    { category: "edge", currency: "CAD", amount: -2 },
    { category: "edge", currency: "USD", amount: Number.MIN_SAFE_INTEGER },
    { category: "edge", currency: "USD", amount: -1 },
    { category: "edge", currency: "USD", amount: 1 },
  ]);

  assert.deepEqual(result, [
    { category: "edge", currency: "CAD", amount: Number.MAX_SAFE_INTEGER },
    { category: "edge", currency: "USD", amount: Number.MIN_SAFE_INTEGER },
  ]);
});

test("aggregate rejects malformed expense data", () => {
  assert.throws(() => aggregate(null), TypeError);
  for (const expense of [
    null,
    [],
    { currency: "CAD", amount: 100 },
    { category: "  ", currency: "CAD", amount: 100 },
    { category: "food", currency: "cad", amount: 100 },
    { category: "food", currency: "CAD", amount: 1.5 },
    { category: "food", currency: "CAD", amount: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(() => aggregate([expense]), TypeError);
  }
});

test("aggregate rejects totals outside the safe integer range", () => {
  for (const amounts of [
    [Number.MAX_SAFE_INTEGER, 1],
    [Number.MIN_SAFE_INTEGER, -1],
  ]) {
    assert.throws(
      () => aggregate(amounts.map((amount) => ({ category: "food", currency: "CAD", amount }))),
      RangeError,
    );
  }
});
