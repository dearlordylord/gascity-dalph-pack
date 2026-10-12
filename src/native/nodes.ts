/** Native controls mirror subject metadata but are not executable project-task leaves. */
export function isExecutionMetadata(metadata: Readonly<Record<string, string>>): boolean {
  return !["ralph", "spec", "retry", "check", "scope"].includes(metadata["gc.kind"] ?? "")
}

/** Product implementation nodes exclude native check and specification controls. */
export function isImplementationMetadata(metadata: Readonly<Record<string, string>>): boolean {
  return metadata["dalph.phase"] === "work" && isExecutionMetadata(metadata)
}

/** The logical native review budget owner retains identity when subject phase is mirrored. */
export function isReviewControlMetadata(metadata: Readonly<Record<string, string>>): boolean {
  return (
    metadata["gc.kind"] === "ralph" &&
    metadata["gc.step_id"] === "review" &&
    ["native-one-task.review", "native-review-continuation.review"].includes(metadata["gc.step_ref"] ?? "")
  )
}
