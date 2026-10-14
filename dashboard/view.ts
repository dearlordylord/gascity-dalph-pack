import { project } from "../src/dashboard/projection.ts"
import type { RunDetail } from "../src/dashboard/run.ts"
import { observedTasks, type ObservedTask } from "../src/dashboard/tasks.ts"
import type { DeliveryGraphElement } from "./vendor/delivery-graph-element.ts"

export function mountDashboard(
  document: Document,
  graph: Pick<DeliveryGraphElement, "projection" | "selectedTaskId" | "resetView" | "addEventListener">,
  location: Pick<Location, "search">
) {
  const window = document.defaultView
  if (!window) throw new Error("Dashboard document has no window")
  const JSON_INDENT = 2
  const PERCENT = 100
  const byId = (id: string): HTMLElement => {
    const found = document.getElementById(id)
    if (!found) throw new Error(`Missing element: ${id}`)
    return found
  }
  const input = (id: string): HTMLInputElement => {
    const found = byId(id)
    if (!(found instanceof window.HTMLInputElement)) throw new Error(`Expected input: ${id}`)
    return found
  }
  const params = new URLSearchParams(location.search)
  const city = params.get("city") || "dalph-expenses"
  const run = params.get("run") || "ex-aly"
  const scope = params.get("scope") || "expenses"
  const native = params.get("native")
  const nativeOrigin = native && /^https?:\/\/[a-zA-Z0-9.:[\]-]+$/.test(native) ? native : null
  let detail: RunDetail | undefined
  let selected: string | undefined
  input("run").value = run
  input("city").value = city
  input("scope").value = scope
  byId("open").onclick = () => {
    location.search = String(
      new URLSearchParams({
        city: input("city").value,
        run: input("run").value,
        scope: input("scope").value,
        ...(nativeOrigin ? { native: nativeOrigin } : {})
      })
    )
  }
  byId("fit").onclick = () => graph?.resetView()
  const element = <Tag extends keyof HTMLElementTagNameMap>(tag: Tag, text: string, className?: string) => {
    const e = document.createElement(tag)
    e.textContent = text
    if (className) e.className = className
    return e
  }
  function nodeButton(n: ObservedTask) {
    const b = element("button", n.title)
    b.onclick = () => select(n.id)
    return b
  }
  function select(id: string) {
    selected = id
    if (graph) graph.selectedTaskId = id
    renderSelection()
  }
  function renderSelection() {
    const panel = byId("facts")
    panel.replaceChildren()
    const n = detail && observedTasks(detail).find((n) => n.id === selected)
    if (!n || !detail) {
      panel.append(element("p", "Select a task to inspect its dependencies and execution."))
      return
    }
    panel.append(element("h2", n.title), element("p", `${n.phase} · ${n.status}`, "mono"))
    const deps = project(detail).edges.filter((e) => e.to === n.id)
    panel.append(element("h3", "Prerequisites"))
    for (const e of deps) {
      const dep = observedTasks(detail).find((n) => n.id === e.from)
      panel.append(dep ? nodeButton(dep) : element("p", e.from))
    }
    if (!deps.length) panel.append(element("p", "No prerequisites"))
    panel.append(element("h3", "Execution observations"))
    for (const instance of n.nodes.flatMap((node) => node.executionInstances)) {
      panel.append(element("p", `${instance.beadId} · ${instance.status} · ${instance.label}`, "mono"))
      if (instance.session?.link) panel.append(element("p", instance.session.link.sessionName, "mono"))
    }
    const raw = element("details", "")
    raw.append(
      element("summary", "Raw observation"),
      element(
        "pre",
        JSON.stringify(
          n.nodes.flatMap((node) => node.executionInstances),
          null,
          JSON_INDENT
        )
      )
    )
    panel.append(raw)
    if (nativeOrigin) {
      const a = element("a", "Open in Gas City ↗")
      a.href = `${nativeOrigin}/city/${encodeURIComponent(city)}/runs/${encodeURIComponent(run)}`
      a.target = "_blank"
      a.rel = "noopener"
      panel.append(a)
    }
  }
  function render() {
    if (!detail || !graph) return
    graph.projection = project(detail)
    byId("title").textContent = detail.title
    const visible = observedTasks(detail)
    const done = visible.filter((n) => ["completed", "done"].includes(n.status))
    const ready = visible.filter((n) => n.status === "ready")
    const active = visible.filter((n) => ["running", "active"].includes(n.status))
    byId("counts").textContent =
      `${done.length}/${visible.length} completed · ${ready.length} ready · ${active.length} active`
    byId("progress").style.width = `${visible.length ? (PERCENT * done.length) / visible.length : 0}%`
    for (const [id, rows, empty] of [
      ["frontier", ready, "No ready tasks"],
      ["active", active, "No running tasks"]
    ] satisfies ReadonlyArray<readonly [string, ReadonlyArray<ObservedTask>, string]>) {
      const p = byId(id)
      p.replaceChildren()
      for (const n of rows) p.append(nodeButton(n))
      if (!rows.length) p.append(element("p", empty))
    }
    byId("partial").textContent =
      detail.completeness.kind === "partial"
        ? `Partial observation: ${(detail.completeness.reasons || []).join(", ")}`
        : ""
    renderSelection()
  }
  graph.addEventListener("task-selected", (e) => {
    if (e instanceof window.CustomEvent && typeof e.detail.taskId === "string") select(e.detail.taskId)
  })

  return {
    city,
    run,
    scope,
    refreshing() {
      byId("connection").textContent = detail ? "Refreshing…" : "Connecting to Gas City…"
    },
    observe(value: RunDetail, observedAt: string) {
      detail = value
      render()
      byId("connection").textContent = `Live · observed ${observedAt}`
      byId("error").textContent = ""
    },
    failed(error: unknown) {
      byId("connection").textContent = detail ? "Stale · refresh failed" : "Connection unavailable"
      byId("error").textContent = String(error)
    }
  }
}
