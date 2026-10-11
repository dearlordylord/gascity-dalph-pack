import { Schema } from "effect"

export const Identity = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("GraphIdentity"))
const Session = Schema.Struct({ link: Schema.optionalKey(Schema.Struct({ sessionName: Schema.String })) })
const Instance = Schema.Struct({
  beadId: Schema.String,
  status: Schema.String,
  label: Schema.String,
  session: Schema.optionalKey(Session)
})
export const GraphNode = Schema.Struct({
  id: Identity,
  title: Schema.String,
  status: Schema.String,
  currentBeadId: Schema.String,
  visibleInGraph: Schema.Boolean,
  constructKind: Schema.String,
  executionInstances: Schema.Array(Instance)
})
export type GraphNode = typeof GraphNode.Type
export const RunDetail = Schema.Struct({
  runId: Identity,
  title: Schema.String,
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(Schema.Struct({ from: Identity, to: Identity, kind: Schema.String })),
  progress: Schema.Struct({ terminal: Schema.Boolean }),
  completeness: Schema.Struct({ kind: Schema.String, reasons: Schema.optionalKey(Schema.Array(Schema.String)) })
})
export type RunDetail = typeof RunDetail.Type
