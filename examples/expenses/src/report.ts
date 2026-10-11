import { aggregate } from "./totals.ts"

/**
 * Create a deterministic, JSON-compatible summary of an expense list.
 *
 * @param {Array<{category: string, currency: string, amount: number}>} expenses
 * @returns {{count: number, totals: Array<{category: string, currency: string, amount: number}>}}
 */
export function createReport(expenses: ReadonlyArray<{ category: string; currency: string; amount: number }>) {
  const totals = aggregate(expenses)

  return { count: expenses.length, totals }
}
