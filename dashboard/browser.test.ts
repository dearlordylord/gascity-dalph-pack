import { chromium } from "playwright"
import { Config, Console, Effect, FileSystem } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"
import { BoundaryFailure } from "../src/domain/shared.ts"

const main = Effect.scoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const fixture = yield* fs.readFileString(fileURLToPath(new URL("./fixtures/fork-join.json", import.meta.url)))
    const url = yield* Config.String("DALPH_DASHBOARD_URL").pipe(Config.withDefault("http://127.0.0.1:43597/"))
    const browser = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => chromium.launch({ headless: true, args: ["--no-sandbox"] }),
        catch: (error) => new BoundaryFailure({ message: String(error) })
      }),
      (browser) => Effect.promise(() => browser.close())
    )
    yield* Effect.tryPromise({
      try: async () => {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        let failed = false
        await page.route("**/api/city/**", (route) =>
          route.fulfill(
            failed
              ? { status: 503, contentType: "application/json", body: '{"error":"offline"}' }
              : { contentType: "application/json", body: fixture }
          )
        )
        await page.goto(url)
        await page.waitForFunction(() => document.getElementById("connection")?.textContent?.startsWith("Live"))
        const count = (key: string) =>
          page.locator("dalph-delivery-graph").evaluate((element, selected) => {
            const projection: unknown = Reflect.get(element, "projection")
            if (!projection || typeof projection !== "object") throw new Error("No graph projection")
            const collection: unknown = Reflect.get(projection, selected)
            if (!Array.isArray(collection)) throw new Error("No graph collection")
            return collection.length
          }, key)
        assert.equal(await count("edges"), 4)
        assert.equal(
          await page.locator("dalph-delivery-graph").evaluate((element) => {
            const details = element.shadowRoot?.querySelector("details")
            if (!(details instanceof HTMLDetailsElement)) throw new Error("Missing graph summary")
            return details.open
          }),
          false
        )
        await page.locator("#frontier button").click()
        for (const title of ["Join report text", "Format total lines", "Format item count"])
          assert.ok((await page.locator("#facts").innerText()).includes(title))
        assert.equal(await count("tasks"), 4)
        await page.locator("#fit").click()
        failed = true
        await page.waitForFunction(
          () => document.getElementById("connection")?.textContent?.startsWith("Stale"),
          {},
          { timeout: 20000 }
        )
        assert.equal(await count("tasks"), 4)
        assert.ok((await page.locator("#error").innerText()).length > 0)
        assert.deepEqual(errors, [])
        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, {}, { timeout: 3000 })
      },
      catch: (error) => new BoundaryFailure({ message: `Browser acceptance failed: ${String(error)}` })
    })
    yield* Console.log(
      "Browser passed: fork/join, collapsed summary, selection prerequisites, task phases, fit, retained stale graph, mobile layout"
    )
  })
)
NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
