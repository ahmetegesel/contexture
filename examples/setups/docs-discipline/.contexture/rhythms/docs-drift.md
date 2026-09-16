@rhythm docs-drift
  use when: code changed and its docs may have fallen behind, a drift sweep is due, or a sync brought teammate changes
  activation: propose
  1. SYNC: the checkout is current first: fetch the remote; a branch is brought up to date with main per the workspace's flow, the main line fast-forwards to the latest; a stale base reconciles against the wrong reality
  2. DELTA: the repository's git delta, status-prefixed (the status marker is load-bearing for deletions)
  3. RECONCILE: heavy deltas run as lanes, one per repository or affected area, parallel on independence; a single-doc delta reconciles in place; each affected doc updated where behavior, contracts, or pitfalls moved
  4. COVERAGE: uncovered paths widen a unit's sources or open a new unit
  5. VERIFY: docs-audit and docs-check clean over the corpus and the delta
  6. LAND: the doc change lands in the workspace repository, cross-referenced from the code change
  7. REFRESH: run @refresh
  ground: the procedure lives in docs/workspace/conventions.md @rule docs/drift
