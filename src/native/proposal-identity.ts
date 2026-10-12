import type { NativeAttempt, NativeProposal } from "./contract.ts"

/** A retained proposal names exactly the original immutable product attempt. */
export const proposalMatchesAttempt = (proposal: typeof NativeProposal.Type, attempt: typeof NativeAttempt.Type) =>
  proposal.attempt === attempt.plan.attempt &&
  proposal.base === attempt.plan.base &&
  proposal.task === attempt.task &&
  proposal.path === attempt.plan.path
