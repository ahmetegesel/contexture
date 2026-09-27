@rhythm docs-drift
  use when: code changed and its docs may have fallen behind, a drift sweep is due, or a sync brought teammate changes
  activation: propose
  1. SYNC: checkout current with remote; clean working tree
  2. DELTA: the code delta from git, status-prefixed (the status marker is load-bearing for deletions), with the corpus half: the corpus paths of the same git delta under the files driver, ctx docs changes under a store
  3. BACKLOG: affected units from delta declared as @task entries in backlog.md before reconciliation begins
  4. RECONCILE: heavy deltas run as subagents, one per affected area, parallel on independence; single-doc delta reconciles in place; each affected doc updated through the ctx docs write verbs where behavior, contracts, or pitfalls moved
  5. COVERAGE: uncovered paths widen a unit's sources or insert a new @task into the backlog
  6. VERIFY: ctx docs gate clean for a working tree (it composes both halves on every driver); for a pushed range, the code delta plus the corpus half (ctx docs changes --since=<rev> under a store) in one stream into ctx docs check (the two failure modes live in the ground rule; the working command in the README's two-sided delta paragraph)
  7. LAND: the code change lands in its repository; the doc change lands in the corpus store (with the workspace repository when a files-driver corpus is tracked), cross-referenced from the code change
  8. REFRESH: run @refresh
  ground: the procedure lives in the workspace conventions, @rule docs/drift (ctx docs query workspace --rules docs/drift)
