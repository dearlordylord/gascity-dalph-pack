/**
 * Format a non-negative expense count with the appropriate singular or plural noun.
 *
 * @param {number} count
 * @returns {string}
 */
export function formatCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError("count must be a non-negative safe integer")
  }

  return `${count} ${count === 1 ? "expense" : "expenses"}`
}
