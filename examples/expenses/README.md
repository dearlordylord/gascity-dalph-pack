# Expenses CLI

Parse expense CSV files and report totals by category and currency.

## Usage

Run the executable with a CSV path. Pass `--rules` to apply category rules, or
`--json` to print the report as JSON:

```sh
mise exec -- ./bin/expenses.mjs expenses.csv --rules rules.json
mise exec -- ./bin/expenses.mjs expenses.csv --rules rules.json --json
```

The CSV must have exactly these headers: `date`, `description`, `amount`, and
`currency`. Columns may appear in any order. Dates use `YYYY-MM-DD`, amounts
accept up to two decimal places, and currencies are three uppercase letters.
Amounts are converted to integer minor units before they are totaled.

Rules are a JSON array of objects with `match` and `category` strings:

```json
[
  { "match": "coffee", "category": "food" },
  { "match": "bus", "category": "transport" }
]
```

Matches are case-insensitive substrings of the description. The first matching
rule sets the category; expenses with no match use `uncategorized`.

## Output

Human output includes the expense count and totals sorted by category and then
currency. For the sample data in `test/fixtures/expenses.csv` with its matching
rules file, it looks like this:

```text
5 expenses
Totals by category and currency:
food | CAD -1.50
food | USD 12.50
transport | CAD 2.50
uncategorized | CAD 8.00
```

With `--json`, output has a `count` and a sorted `totals` array. Each total
contains its `category`, `currency`, and integer `amount` in minor units:

```json
{
  "count": 5,
  "totals": [
    { "category": "food", "currency": "CAD", "amount": -150 },
    { "category": "food", "currency": "USD", "amount": 1250 },
    { "category": "transport", "currency": "CAD", "amount": 250 },
    { "category": "uncategorized", "currency": "CAD", "amount": 800 }
  ]
}
```

Invalid input is reported to stderr and exits with a nonzero status.

## Formatting helpers

- `formatAmount(amount)` formats integer minor units with two decimal places.
- `formatCount(count)` returns the singular or plural expense label.
- `formatTotals(totals)` returns one formatted line per category and currency.
- `renderReportText(report)` joins the count and total lines without a trailing
  newline.

For example:

```js
import { renderReportText } from "./src/report-text.mjs";

console.log(renderReportText({
  count: 2,
  totals: [
    { category: "food", currency: "USD", amount: 123 },
    { category: "travel", currency: "EUR", amount: -50 },
  ],
}));
```

```text
2 expenses
food | USD | 1.23
travel | EUR | -0.50
```

## Tests

Run the complete test suite with:

```sh
mise exec -- pnpm test
```
