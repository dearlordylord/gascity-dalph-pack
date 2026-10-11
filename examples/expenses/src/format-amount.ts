/**
 * Format an integer amount in minor units as a decimal amount with two places.
 *
 * BigInt is used for the division so every safe integer, including the limits
 * of Number's safe range, is formatted without floating-point rounding.
 *
 * @param {number} amount
 * @returns {string}
 */
export function formatAmount(amount: number) {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("amount must be a safe integer number of minor units")
  }

  const minorUnits = BigInt(amount)
  const sign = minorUnits < 0n ? "-" : ""
  const absoluteMinorUnits = minorUnits < 0n ? -minorUnits : minorUnits
  const whole = absoluteMinorUnits / 100n
  const fraction = (absoluteMinorUnits % 100n).toString().padStart(2, "0")

  return `${sign}${whole}.${fraction}`
}
