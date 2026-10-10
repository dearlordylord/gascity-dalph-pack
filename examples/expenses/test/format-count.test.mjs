import assert from "node:assert/strict";
import test from "node:test";

import { formatCount } from "../src/format-count.mjs";

test("formatCount uses the plural form for zero", () => {
  assert.equal(formatCount(0), "0 expenses");
});

test("formatCount uses the singular form for one", () => {
  assert.equal(formatCount(1), "1 expense");
});

test("formatCount uses the plural form for multiple expenses", () => {
  assert.equal(formatCount(2), "2 expenses");
  assert.equal(formatCount(Number.MAX_SAFE_INTEGER), "9007199254740991 expenses");
});

test("formatCount rejects negative, non-integer, and unsafe inputs", () => {
  for (const count of [
    -1,
    -0.5,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
    NaN,
    Infinity,
    -Infinity,
    "1",
    1n,
    null,
    undefined,
  ]) {
    assert.throws(() => formatCount(count), TypeError, `expected ${String(count)} to be rejected`);
  }
});
