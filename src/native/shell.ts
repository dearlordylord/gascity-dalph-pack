/** Encode one literal argv value for the private native check launcher. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
