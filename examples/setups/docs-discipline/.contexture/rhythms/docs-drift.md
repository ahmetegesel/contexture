@rhythm docs-drift
  use when: code changed and its docs may have fallen behind, a drift sweep is due, or a sync brought teammate changes
  activation: propose
  1. SYNC: checkout current with remote; clean working tree
  2. DELTA: repository git delta, status-prefixed (status marker is load-bearing for deletions)
  3. BACKLOG: affected units from delta declared as @task entries in backlog.md before reconciliation begins
  4. RECONCILE: heavy deltas run as lanes, one per affected area, parallel on independence; single-doc delta reconciles in place; each affected doc updated where behavior, contracts, or pitfalls moved
  5. COVERAGE: uncovered paths widen a unit's sources or insert a new @task into the backlog
  6. VERIFY: docs-audit and docs-check clean over corpus and delta
  7. LAND: doc change lands in workspace repository, cross-referenced from code change
  8. REFRESH: run @refresh
  ground: the procedure lives in docs/workspace/conventions.md @rule docs/drift
