const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

/**
 * Parse a decimal amount with at most two fractional digits into minor units.
 *
 * Parsing with BigInt keeps the conversion exact and avoids floating-point
 * rounding. The returned value is a number because it is the model's public
 * representation, so amounts outside JavaScript's safe integer range are
 * rejected.
 *
 * @param {string} value
 * @returns {number}
 */
export function parseAmount(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("amount must be a decimal string")
  }

  const match = AMOUNT_PATTERN.exec(value)
  if (!match || match[0] !== value) {
    throw new TypeError("amount must have at most two decimal places")
  }

  const [, sign, whole, fraction = ""] = match
  const minorUnits = BigInt(whole ?? "0") * 100n + BigInt(fraction.padEnd(2, "0") || "0")
  const signedMinorUnits = sign === "-" ? -minorUnits : minorUnits

  if (signedMinorUnits > BigInt(Number.MAX_SAFE_INTEGER) || signedMinorUnits < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("amount is outside the safe integer range")
  }

  return Number(signedMinorUnits)
}

function isValidDate(value: string) {
  const match = DATE_PATTERN.exec(value)
  if (!match || match[0] !== value) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year === 0 || month < 1 || month > 12 || day < 1) return false

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (daysInMonth[month - 1] ?? 0)
}

/**
 * Validate and normalize an expense record.
 *
 * @param {{date: string, description: string, amount: string, currency: string}} record
 * @returns {{date: string, description: string, amount: number, currency: string}}
 */
export function validateExpense(record: unknown) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("expense must be an object")
  }

  const date = "date" in record ? record.date : undefined
  const description = "description" in record ? record.description : undefined
  const amount = "amount" in record ? record.amount : undefined
  const currency = "currency" in record ? record.currency : undefined

  if (typeof date !== "string" || !isValidDate(date)) {
    throw new TypeError("date must be a valid YYYY-MM-DD date")
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new TypeError("description must be a non-empty string")
  }
  if (typeof currency !== "string" || currency.length !== 3 || !CURRENCY_PATTERN.test(currency)) {
    throw new TypeError("currency must be three uppercase letters")
  }

  return { date, description, amount: parseAmount(amount), currency }
}
