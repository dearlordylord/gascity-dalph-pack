Use integer minor units. Public API:
- parseAmount(string) -> integer
- validateExpense(record) -> {date, description, amount, currency}
- parseCsv(text) -> expenses
- categorize(expense, rules) -> expense with category
- rules: [{match: string, category: string}]
- aggregate(expenses) -> [{category, currency, amount}]
- createReport(expenses) -> {count, totals}
