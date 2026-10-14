# Native product graph

The Operator launches A → {B,C} → D. Gas City owns readiness, claims, dispatch
and native workflow finality. Each task has an ordinary completion barrier and a
native launch leaf. B/C launches wait for A completion; D waits for B and C.
Completion of a launch leaf never means delivery completion.

Before cooking an attached task batch, the prepare actor records an immutable
launch intent through public metadata CAS. Only an acknowledged first write
permits cook. Existing or ambiguous intent requires exact correlated root
observation, including terminal roots; absent/duplicate/partial roots refuse
rather than recook. All batch execution depends on an ordinary activation latch.
The actor records the exact root before closing the latch and its launch leaf.

A native teardown leaf observes exact review, publication, promotion and owned
cleanup proof before closing the product completion barrier. Failed batches keep
that barrier open. The original attempt and review budgets remain immutable.
Recovery reconciles retained identities and resources before any retry. B/C may
overlap under two implementation positions; only one target integrator writes.

Direct proof starts with formula compilation and a minimal public attached batch
with an open latch. It must show no actor starts before activation, a resumed
launch uses the same root, and product closure waits for settlement. The final
live diamond must retain exact attempts through interruption, integrate both
branches before D, close all product tasks, remove only owned temporary resources,
and display four task squares with live updates and stale-read handling.

The current broad native acceptance remains incomplete. Its exhausted verification
infrastructure repair does not block ready product implementation; no missing
check is credited as passed. Product capability, custody and delivery defects
continue to block their affected boundary.
