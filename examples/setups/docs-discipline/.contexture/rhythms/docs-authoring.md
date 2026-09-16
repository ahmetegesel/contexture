@rhythm docs-authoring
  use when: a repository or unit has no docs yet, or a doc set needs writing from scratch
  activation: propose
  1. SYNC: the checkout is current first: fetch the remote; a branch is brought up to date with main per the workspace's flow, the main line fast-forwards to the latest; a stale base drafts against the wrong reality
  2. MAP: a recon lane maps the codebase into coherent units; each unit's sources globs scoped
  3. DRAFT: one lane per unit, or per repo when units share context, parallel on independence; each written per .contexture/templates/doc.md
  4. AUDIT: docs-audit over the drafts; zero errors
  5. COVERAGE: docs-check over the repository's tracked files; uncovered paths widen a unit's sources or open a new unit
  6. PROJECT: docs-query for the new units and their file owners; the projection reads clean
  7. REFRESH: run @refresh
  ground: the procedure lives in docs/workspace/conventions.md @rule docs/authoring
