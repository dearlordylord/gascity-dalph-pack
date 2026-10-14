First claim one item through Gas City:

`gc --city "$DALPH_CITY_ROOT" --rig "$DALPH_RIG" hook --claim --drain-ack --json`

Continue only when the response action is `work`. Read that exact bead's
description and metadata through `gc beads show <bead-id> --format=json`. For `idle` or `drain`,
cease task work and let Gas City retire the session. A command error requires
a visible diagnostic, never a task result or a copied earlier claim.

Implement exactly
its description in your current prepared attempt worktree. Commit all changes
and leave the tree clean. Do not push, integrate, create another worktree,
launch another agent or close any delivery node.

When finished run `mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" finish`.
That command records your correlated proposal and closes only implementation
work. After recording the proposal, cease task work and remain idle without further
worktree writes. Gas City observes idle and owns session retirement.
Qualification and deterministic delivery are separate native workflow boundaries.

For a node whose metadata `dalph.phase` is `fix`, run the native `review-context`
command first, apply only its retained blocking findings in this same worktree,
commit the fixes and run native `finish-fix` instead of `finish`. After the correlated fix proposal is retained, cease task work and allow
Gas City to retire the idle session.
