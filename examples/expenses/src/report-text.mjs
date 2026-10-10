import { formatCount } from "./format-count.mjs";
import { formatTotals } from "./format-totals.mjs";

/**
 * Render a report as a count line followed by one line per category total.
 *
 * @param {{count: number, totals: Array<{category: string, currency: string, amount: number}>}} report
 * @returns {string}
 */
export function renderReportText(report) {
  return [formatCount(report.count), ...formatTotals(report.totals)].join("\n");
}
