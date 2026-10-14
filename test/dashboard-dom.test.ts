// @vitest-environment happy-dom
import { readFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { mountDashboard } from "../dashboard/view.ts"
import { RunDetail } from "../src/dashboard/run.ts"
import { project } from "../src/dashboard/projection.ts"

const fixture = Effect.tryPromise(() => readFile("dashboard/fixtures/fork-join.json", "utf8")).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(RunDetail)))
)
function mount(detail: RunDetail) {
  document.body.innerHTML = `
    <input id="run"><input id="city"><input id="scope">
    <button id="open"></button><button id="fit"></button>
    <div id="facts"></div><div id="title"></div><div id="counts"></div>
    <div id="progress"></div><div id="frontier"></div><div id="active"></div>
    <div id="partial"></div><div id="connection"></div><div id="error"></div>`
  const graph = Object.assign(document.createElement("div"), {
    projection: project(detail),
    selectedTaskId: "",
    resetView() {}
  })
  const view = mountDashboard(document, graph, { search: "?city=demo&run=diamond&scope=project" })
  return { view, graph }
}
it.effect("in-memory DOM shows four graph tasks, edges, frontier and selected task facts", () =>
  Effect.gen(function* () {
    const detail = yield* fixture
    const { graph, view } = mount(detail)
    view.observe(detail, "first")
    expect(graph.projection.tasks).toHaveLength(4)
    expect(graph.projection.edges).toHaveLength(4)
    expect(document.getElementById("frontier")?.querySelectorAll("button").length).toBeGreaterThan(0)
    const task = graph.projection.tasks[0]
    if (!task) throw Error("missing task")
    graph.dispatchEvent(new CustomEvent("task-selected", { detail: { taskId: task.id } }))
    expect(graph.selectedTaskId).toBe(task.id)
    expect(document.getElementById("facts")?.textContent).toContain("Prerequisites")
    expect(document.getElementById("facts")?.textContent).toContain("Execution observations")
  })
)
it.effect("failed refresh retains selected graph and facts; next observation clears stale error", () =>
  Effect.gen(function* () {
    const detail = yield* fixture
    const { graph, view } = mount(detail)
    view.failed("offline")
    expect(document.getElementById("connection")?.textContent).toBe("Connection unavailable")
    view.observe(detail, "first")
    const task = graph.projection.tasks[0]
    if (!task) throw Error("missing task")
    graph.dispatchEvent(new CustomEvent("task-selected", { detail: { taskId: task.id } }))
    const observed = graph.projection
    const facts = document.getElementById("facts")?.textContent
    view.refreshing()
    view.failed("lost response")
    expect(graph.projection).toBe(observed)
    expect(document.getElementById("facts")?.textContent).toBe(facts)
    expect(document.getElementById("connection")?.textContent).toBe("Stale · refresh failed")
    expect(document.getElementById("error")?.textContent).toBe("lost response")
    view.observe({ ...detail, title: "Updated graph" }, "second")
    expect(document.getElementById("title")?.textContent).toBe("Updated graph")
    expect(document.getElementById("connection")?.textContent).toBe("Live · observed second")
    expect(document.getElementById("error")?.textContent).toBe("")
    expect(graph.selectedTaskId).toBe(task.id)
  })
)
