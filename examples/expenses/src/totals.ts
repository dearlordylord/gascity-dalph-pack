const CURRENCY_PATTERN = /^[A-Z]{3}$/
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER)

function compareKeys(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * Aggregate normalized expenses by category and currency.
 *
 * The returned rows are ordered by category and then currency, so equivalent
 * input data produces the same result regardless of input order.
 *
 * @param {Array<{category: string, currency: string, amount: number}>} expenses
 * @returns {Array<{category: string, currency: string, amount: number}>}
 */
export function aggregate(expenses: ReadonlyArray<{ category: string; currency: string; amount: number }>) {
  if (!Array.isArray(expenses)) {
    throw new TypeError("expenses must be an array")
  }

  const totals = new Map<string, Map<string, bigint>>()

  for (const expense of expenses) {
    if (expense === null || typeof expense !== "object" || Array.isArray(expense)) {
      throw new TypeError("expense must be an object")
    }

    const { category, currency, amount } = expense
    if (typeof category !== "string" || category.trim().length === 0) {
      throw new TypeError("category must be a non-empty string")
    }
    if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
      throw new TypeError("currency must be three uppercase letters")
    }
    if (!Number.isSafeInteger(amount)) {
      throw new TypeError("amount must be a safe integer in minor units")
    }

    let currencyTotals = totals.get(category)
    if (!currencyTotals) {
      currencyTotals = new Map()
      totals.set(category, currencyTotals)
    }

    const amountTotal = (currencyTotals.get(currency) ?? 0n) + BigInt(amount)
    currencyTotals.set(currency, amountTotal)
  }

  const result = []

  for (const [category, currencyTotals] of [...totals.entries()].sort(([left], [right]) => compareKeys(left, right))) {
    for (const [currency, total] of [...currencyTotals.entries()].sort(([left], [right]) => compareKeys(left, right))) {
      if (total > MAX_SAFE_INTEGER || total < MIN_SAFE_INTEGER) {
        throw new RangeError(`total for ${category} in ${currency} is outside the safe integer range`)
      }
      result.push({ category, currency, amount: Number(total) })
    }
  }

  return result
}
