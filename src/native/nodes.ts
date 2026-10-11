/** Product implementation nodes exclude native check and specification controls. */
export function isImplementationMetadata(metadata: Readonly<Record<string, string>>): boolean {
  return metadata["dalph.phase"] === "work" && metadata["gc.kind"] !== "ralph" && metadata["gc.kind"] !== "spec"
}
