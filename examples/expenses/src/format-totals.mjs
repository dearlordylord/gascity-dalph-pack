import { formatAmount } from "./format-amount.mjs";

/**
 * Format category and currency totals for display.
 *
 * @param {Array<{category: string, currency: string, amount: number}>} totals
 * @returns {string[]}
 */
export function formatTotals(totals) {
  return totals.map(({ category, currency, amount }) =>
    `${category} | ${currency} | ${formatAmount(amount)}`,
  );
}
