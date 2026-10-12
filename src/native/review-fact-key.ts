import { createHash } from "node:crypto"
import { Schema } from "effect"

const MAX_REVIEW_FACT_KEY_LENGTH = 128

/** Bounded native tracker locator; the retained verdict owns the logical batch identity. */
export const ReviewFactKey = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z_][a-zA-Z0-9_./]*$/),
  Schema.isMaxLength(MAX_REVIEW_FACT_KEY_LENGTH)
).pipe(Schema.brand("ReviewFactKey"))
type ReviewFactKind = "native_review" | "native_approved" | "native_fix" | "native_review_candidate"

export function reviewFactKey(kind: ReviewFactKind, batch: string, round: number) {
  const locator = batch === "initial" ? batch : `batch_${createHash("sha256").update(batch).digest("hex")}`
  return ReviewFactKey.make(`${kind}_${locator}_${round}`)
}
