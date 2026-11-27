@rhythm docs-drift
  use when: code changed and its docs may have fallen behind, a drift sweep is due, or a sync brought teammate changes
  activation: propose
  1. SYNC: checkout current with remote; clean working tree
  2. DELTA: the change delta, never memory: the code delta from git, status-prefixed (a name-only delta carries no deletion marker, so its deleted files read as uncovered), with the corpus half in the same stream: the corpus paths of the same git delta under posix with a tracked corpus, else the docs this flow updates (an untracked corpus, every store driver included)
  3. BACKLOG: affected units from delta declared as tasks in the backlog (ctx unit task add) before reconciliation begins
  4. RECONCILE: heavy deltas run as subagents, one per affected area, parallel on independence; single-doc delta reconciles in place; each affected doc updated through the ctx docs write verbs in the same change where behavior, contracts, or pitfalls moved
  5. COVERAGE: uncovered paths widen a unit's sources or open a new unit as a new @task in the backlog
  6. VERIFY: the audit and the check re-run clean before the reconciliation lands: ctx docs gate clean for a working tree, ctx docs gate --since=<rev> for a range the workspace root committed (both compose the halves for a tracked corpus; an untracked corpus, a store driver's included, reads process-owned, so this flow's own list is its half); for a pushed range, the code delta plus the corpus half (this flow's own list) in one stream into ctx docs check, never the code half alone: the check freshens a file only when a doc path rides the same stream, so a code-only stream never passes where a claimant is tracked, and reads CLEAN (PROCESS-OWNED) where every claimant is untracked: either way its verdict says nothing about the docs (the working command in ctx docs help check)
  7. LAND: the code change lands in its repository; the doc change lands in the corpus store (with the workspace repository when the corpus is tracked under posix), cross-referenced from the code change
  8. REFRESH: run @refresh
  ground: the procedure and its two failure modes live in these steps; the docs laws bind them (@laws#corpus-reconcile, @laws#docs-are-code)
