@rhythm docs-authoring
  use when: a workspace, repository, or unit has no docs yet, or a doc set needs writing from scratch
  activation: propose
  1. SYNC: checkout current with remote; clean working tree
  2. MAP: recon subagent maps units; workspace scope seeds docs/workspace/system-map.md (@components) as the accumulating roadmap; component scope inventories code packages, datastores (tables/topics/buckets), auxiliary tools (utils/scripts), and cross-boundary exports; slices target into units with scoped sources globs; output lands in lanes/<slug>/report.md
  3. BACKLOG: the MAP subagent report drives the declaration of work in backlog.md; one @task per mapped unit or component, referencing the subagent report; drafting never begins without a declared backlog
  4. DRAFT: one subagent per unit, or per repo when units share context, parallel on independence; tasks advance through IN_PROGRESS as subagents dispatch; drafted per .contexture/templates/doc.md establishing structural baseline (layers, stages, deployables, core responsibilities)
  5. INTERROGATE: adversarial deep-dive of the drafted units against the code per the template's method comments; drafts updated with grounded evidence, no unverified claims
  6. AUDIT: docs-audit over the drafts; zero errors
  7. COVERAGE: docs-check over the repository's tracked files; uncovered paths widen a unit's sources or insert a new @task into the backlog
  8. RECONCILE: semantic depth and boundary audit in subagents; thin docs return to INTERROGATE; merges, splits, and cross-unit edges settle in the backlog; audit and coverage re-verified
  9. PROJECT: docs-query for the new units and their file owners; the projection reads clean
  10. TRACE & ACCUMULATE: a cross-repository boundary trace subagent verifies the system map's claims against code, traces new boundaries, and links connected unit docs with reciprocal @see_also pointers
  11. REFRESH: run @refresh
  ground: the procedure lives in docs/workspace/conventions.md @rule docs/authoring
