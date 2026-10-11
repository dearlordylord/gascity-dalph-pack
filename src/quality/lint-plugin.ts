import type { RuleTester } from "oxlint/plugins-dev"

type Rule = Extract<Parameters<RuleTester["run"]>[1], { create: unknown }>
type Context = Parameters<Rule["create"]>[0]
type Listener = ReturnType<Rule["create"]>
type ObjectPattern = Parameters<NonNullable<Listener["ObjectPattern"]>>[0]
type Property = ObjectPattern["properties"][number]
type Ranged = NonNullable<Parameters<Context["report"]>[0]["node"]>
const rule = (create: (context: Context) => Listener): Rule => ({
  meta: { type: "problem", schema: [], messages: { violation: "{{message}}" } },
  create
})
const report = (context: Context, node: Ranged, message: string) =>
  context.report({ node, messageId: "violation", data: { message } })

const noClockRead = rule((context) => ({
  "CallExpression[callee.object.name='Date'][callee.property.name='now']": (node) =>
    report(context, node, "Read time through Effect Clock or an injected service."),
  "CallExpression[callee.object.name='performance'][callee.property.name='now']": (node) =>
    report(context, node, "Read time through Effect Clock or an injected service."),
  "NewExpression[callee.name='Date'][arguments.length=0]": (node) =>
    report(context, node, "Read time through Effect Clock or an injected service.")
}))
const noDoubleTypeAssertion = rule((context) => ({
  "TSAsExpression > TSAsExpression": (node) =>
    report(context, node, "Parse boundary data instead of double type assertions.")
}))
const noTypeAssertion = rule((context) => ({
  TSAsExpression: (node) => {
    if (
      node.typeAnnotation.type === "TSTypeReference" &&
      node.typeAnnotation.typeName.type === "Identifier" &&
      node.typeAnnotation.typeName.name === "const"
    )
      return
    report(context, node, "Parse, narrow, or use satisfies instead of a type assertion.")
  }
}))
const noTestMocks = rule((context) => ({
  "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock|hoisted|spyOn|stubGlobal|fn|mocked|unmock|clearAllMocks|unstubAllGlobals)$/]":
    (node) => report(context, node, "Substitute dependencies through Effect layers or explicit ports."),
  "CallExpression[callee.object.name='jest'][callee.property.name='mock']": (node) =>
    report(context, node, "Substitute dependencies through Effect layers or explicit ports.")
}))
const propertyTestPlacement = rule((context) => {
  if (/\.property\.(test|spec)\.ts$/.test(context.filename)) return {}
  return {
    "ImportDeclaration[source.value='fast-check']": (node) =>
      report(context, node, "Property tests belong in *.property.test.ts."),
    "CallExpression[callee.object.name='fc'][callee.property.name='property']": (node) =>
      report(context, node, "Property tests belong in *.property.test.ts.")
  }
})
const requireCanonicalEffectSchemaImport = rule((context) => ({
  ImportDeclaration: (node) => {
    if (node.source.value !== "effect") return
    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier")
        report(context, specifier, "Use canonical named Effect imports.")
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "Schema" &&
        specifier.local.name !== "Schema"
      ) {
        report(context, specifier, "Import Schema by its canonical name.")
      }
    }
  }
}))
const noSchemaPrimitive = rule((context) => ({
  "MemberExpression[property.name='NonNegativeInt']": (node) =>
    report(context, node, "Use NonNegativeInteger from src/domain/shared.ts."),
  "ObjectPattern > Property[key.name='NonNegativeInt']": (node) =>
    report(context, node, "Use NonNegativeInteger from src/domain/shared.ts.")
}))
const keyName = (property: Property): string | undefined => {
  if (property.type === "RestElement") return undefined
  if (property.computed) return undefined
  if (property.key.type === "Identifier") return property.key.name
  if (property.key.type === "Literal") return String(property.key.value)
  return undefined
}
const sortDestructureKeys = rule((context) => ({
  ObjectPattern: (node) => {
    // Defaults can refer to earlier bindings; preserving evaluation order takes precedence.
    if (node.properties.some((p) => p.type === "Property" && p.value.type === "AssignmentPattern")) return
    const keys = node.properties.map(keyName).filter((key): key is string => key !== undefined)
    const sorted = keys.toSorted((a, b) => a.localeCompare(b, "en", { numeric: true }))
    if (keys.some((key, index) => key !== sorted[index])) report(context, node, "Sort destructuring keys by name.")
  }
}))

export default {
  meta: { name: "dalph" },
  rules: {
    "no-clock-read": noClockRead,
    "no-double-type-assertion": noDoubleTypeAssertion,
    "no-schema-primitive": noSchemaPrimitive,
    "no-test-mocks": noTestMocks,
    "no-type-assertion": noTypeAssertion,
    "property-test-placement": propertyTestPlacement,
    "require-canonical-effect-schema-import": requireCanonicalEffectSchemaImport,
    "sort-destructure-keys": sortDestructureKeys
  }
}
