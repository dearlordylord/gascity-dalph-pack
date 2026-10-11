#!/usr/bin/env node

import { readFile } from "node:fs/promises"

import { categorize } from "../src/categories.ts"
import { parseCsv } from "../src/csv.ts"
import { createReport } from "../src/report.ts"

const USAGE = "Usage: expenses <csv-path> [--rules <json-path>] [--json]"

function parseArguments(args: ReadonlyArray<string>) {
  let csvPath
  let rulesPath
  let json = false
  let optionsEnabled = true

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (optionsEnabled && argument === "--") {
      optionsEnabled = false
    } else if (optionsEnabled && argument === "--json") {
      json = true
    } else if (optionsEnabled && argument === "--rules") {
      if (rulesPath !== undefined) {
        throw new TypeError("--rules may be specified only once")
      }

      const value = args[index + 1]
      if (value === undefined || value.startsWith("--")) {
        throw new TypeError("--rules requires a JSON path")
      }
      rulesPath = value
      index += 1
    } else if (optionsEnabled && argument?.startsWith("-")) {
      throw new TypeError(`Unknown option: ${argument}`)
    } else if (csvPath === undefined) {
      csvPath = argument
    } else {
      throw new TypeError(`Unexpected argument: ${argument}`)
    }
  }

  if (csvPath === undefined) {
    throw new TypeError(`Missing CSV path. ${USAGE}`)
  }

  return { csvPath, rulesPath, json }
}

async function readInputFile(filePath: string, label: string) {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    throw new Error(
      `Unable to read ${label} file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

function parseRules(text: string) {
  let rules
  try {
    rules = JSON.parse(text)
  } catch (error) {
    throw new TypeError(`Rules file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }

  if (!Array.isArray(rules)) {
    throw new TypeError("Rules file must contain a JSON array")
  }

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index]
    if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
      throw new TypeError(`Rules entry ${index + 1} must be an object`)
    }
    if (typeof rule.match !== "string" || typeof rule.category !== "string") {
      throw new TypeError(`Rules entry ${index + 1} must have string match and category fields`)
    }
  }

  return rules
}

function formatAmount(minorUnits: number) {
  const amount = BigInt(minorUnits)
  const magnitude = amount < 0n ? -amount : amount
  const whole = magnitude / 100n
  const fraction = String(magnitude % 100n).padStart(2, "0")
  return `${amount < 0n ? "-" : ""}${whole}.${fraction}`
}

function renderHuman(report: {
  count: number
  totals: ReadonlyArray<{ category: string; currency: string; amount: number }>
}) {
  const countLabel = report.count === 1 ? "expense" : "expenses"
  const header = `${report.count} ${countLabel}\n`
  if (report.totals.length === 0) return `${header}No totals.\n`

  const totals = report.totals
    .map(({ category, currency, amount }) => `${category} | ${currency} ${formatAmount(amount)}`)
    .join("\n")
  return `${header}Totals by category and currency:\n${totals}\n`
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const csvText = await readInputFile(options.csvPath, "CSV")
  const rules = options.rulesPath === undefined ? [] : parseRules(await readInputFile(options.rulesPath, "rules"))
  const expenses = parseCsv(csvText).map((expense) => categorize(expense, rules))
  const report = createReport(expenses)

  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report))
}

try {
  await main()
} catch (error) {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
