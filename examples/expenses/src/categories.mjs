/**
 * Add the category from the first rule whose match text appears in the
 * expense description, ignoring case.
 *
 * @param {{description: string, [key: string]: unknown}} expense
 * @param {{match: string, category: string}[]} rules
 * @returns {{description: string, category: string, [key: string]: unknown}}
 */
export function categorize(expense, rules) {
  const description = expense.description.toLowerCase();
  const matchedRule = rules.find(({ match }) =>
    description.includes(match.toLowerCase()),
  );

  return {
    ...expense,
    category: matchedRule?.category ?? "uncategorized",
  };
}
