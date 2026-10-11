import { formatCount } from "./format-count.ts"
import { formatTotals } from "./format-totals.ts"

/**
 * Render a report as a count line followed by one line per category total.
 *
 * @param {{count: number, totals: Array<{category: string, currency: string, amount: number}>}} report
 * @returns {string}
 */
export function renderReportText(report: {
  count: number
  totals: ReadonlyArray<{ category: string; currency: string; amount: number }>
}) {
  return [formatCount(report.count), ...formatTotals(report.totals)].join("\n")
}
