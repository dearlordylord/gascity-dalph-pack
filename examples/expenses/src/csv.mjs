import { validateExpense } from "./model.mjs";

const REQUIRED_HEADERS = ["date", "description", "amount", "currency"];

/**
 * Parse CSV records while respecting quoted fields and escaped quotes.
 * Newlines inside quoted fields remain part of the field; CRLF, LF, and CR
 * terminate records elsewhere. Empty physical lines are ignored.
 *
 * @param {string} text
 * @returns {string[][]}
 */
function parseRecords(text) {
  const records = [];
  let fields = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let recordStarted = false;

  const finishField = () => {
    fields.push(field);
    field = "";
    afterQuote = false;
  };

  const finishRecord = () => {
    finishField();
    if (recordStarted) records.push(fields);
    fields = [];
    recordStarted = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        finishField();
        recordStarted = true;
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        finishRecord();
      } else {
        throw new TypeError("CSV contains characters after a closing quote");
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw new TypeError("CSV contains a quote inside an unquoted field");
      }
      inQuotes = true;
      recordStarted = true;
    } else if (character === ",") {
      finishField();
      recordStarted = true;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRecord();
    } else {
      field += character;
      recordStarted = true;
    }
  }

  if (inQuotes) {
    throw new TypeError("CSV contains an unterminated quoted field");
  }
  if (recordStarted || fields.length > 0 || field.length > 0 || afterQuote) {
    finishRecord();
  }

  return records;
}

function validateHeaders(headers) {
  const normalized = headers.map((header) => header.trim());
  const unique = new Set(normalized);

  if (
    normalized.length !== REQUIRED_HEADERS.length ||
    unique.size !== REQUIRED_HEADERS.length ||
    REQUIRED_HEADERS.some((header) => !unique.has(header))
  ) {
    throw new TypeError(`CSV header must contain exactly: ${REQUIRED_HEADERS.join(",")}`);
  }

  return new Map(normalized.map((header, index) => [header, index]));
}

/**
 * Parse expenses from CSV with the required date, description, amount, and
 * currency columns. Header columns may appear in any order.
 *
 * @param {string} text
 * @returns {{date: string, description: string, amount: number, currency: string}[]}
 */
export function parseCsv(text) {
  if (typeof text !== "string") {
    throw new TypeError("CSV input must be a string");
  }

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = parseRecords(source);
  if (records.length === 0) {
    throw new TypeError("CSV must include a header row");
  }

  const columns = validateHeaders(records[0]);
  const expenses = [];

  for (let index = 1; index < records.length; index += 1) {
    const row = records[index];
    const rowNumber = index + 1;
    if (row.length !== REQUIRED_HEADERS.length) {
      throw new TypeError(
        `CSV row ${rowNumber} must have ${REQUIRED_HEADERS.length} columns`,
      );
    }

    const record = Object.fromEntries(
      REQUIRED_HEADERS.map((header) => [header, row[columns.get(header)]]),
    );
    try {
      expenses.push(validateExpense(record));
    } catch (error) {
      const message = `CSV row ${rowNumber}: ${error.message}`;
      if (error instanceof RangeError) {
        throw new RangeError(message, { cause: error });
      }
      throw new TypeError(message, { cause: error });
    }
  }

  return expenses;
}
