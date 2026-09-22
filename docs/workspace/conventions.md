@doc conventions conventions
  repo: workspace
  description: "Universal workspace conventions: documentation discipline, git, releases, security, and typography invariants"
  sources: [AGENTS.workspace.md, AGENTS.local.md, .contexture/modules/**, .contexture/templates/doc.md]
  keywords: [conventions, git, releases, secrets, evidence, laws, prompt-to-doc, stop-gate, authoring, drift]

@rule git/conventional-commits
  directive: must
  statement: "Use Conventional Commits (type(scope): description) for every commit message."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All workspace and repository commit messages."
  evidence: "git log --oneline"
  anti: "updated files and fixed bug"
  good: "fix(auth): handle expired token in refresh flow"

@rule git/commit-per-repo
  directive: must
  statement: "Stage and commit changes per repository independently; never mix multiple repositories in one commit."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All git commits across the workspace and its repositories."
  evidence: "git status -sb"
  anti: "git add . at the workspace root followed by one commit spanning several repositories"
  good: "git -C projects/<repo> commit -m 'feat(api): add orders endpoint'"

@rule security/never-commit-secrets
  directive: never
  statement: "Never commit plaintext secrets, connection strings, passwords, or API tokens into source control."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All repositories and configuration files."
  evidence: ".gitignore"
  caution: "Accidental credential leakage compromises staging and production infrastructure."
  anti: "connectionString = 'Server=db.internal;Password=secret123;'"
  good: "connectionString = builder.Configuration.GetConnectionString('Default')"

@rule docs/docs-are-code
  directive: must
  statement: "Every documented behavior change lands with its doc update in the same unit of work."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All changes affecting public APIs, contracts, behaviors, or dependencies."
  evidence: ".contexture/modules/docs/scripts/docs-audit.awk"
  anti: "Refactoring an API contract without updating the corresponding doc in docs/workspace/"
  good: "Updating the endpoint signature in code and the matching contract rule in docs/workspace/<slug>.md in the same commit"

@rule docs/prompt-to-doc
  directive: must
  statement: "Every task begins with a docs query before inspecting or reading code files."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All task initiations, feature developments, refactorings, and investigations."
  evidence: ".contexture/modules/docs/scripts/query"
  caution: "Reading code files before querying docs causes hallucinated assumptions and misses documented contracts and pitfalls."
  anti: "Reading source files directly before querying the corpus"
  good: "Querying the corpus first (ctx docs query --index, search, or file owner), then reading the owning doc and its pitfalls"

@rule docs/stop-gate
  directive: must
  statement: "Close transactions must pass ctx docs gate cleanly, enforcing syntax integrity, coverage completeness, and doc freshness."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All session completion checkpoints and close transactions."
  evidence: ".contexture/modules/docs/scripts/gate"
  caution: "A failing close gate indicates uncovered code files, uncommitted doc updates, or doc syntax errors that break downstream readers."
  anti: "Closing a task or ending a session with modified code but unupdated documentation"
  good: "Chaining the audit and the check via ctx docs gate to verify coverage and zero stale docs before closing"

@rule docs/authoring
  directive: must
  statement: "New documentation is authored map-first: the codebase is mapped to coherent units with scoped sources globs (never a folder-by-folder mirror), each unit is drafted per .contexture/templates/doc.md, and the draft is verified before it lands (ctx docs audit for integrity, ctx docs check for coverage, ctx docs query for the projected read)."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "Authoring or bootstrapping a documentation corpus."
  evidence: ".contexture/templates/doc.md"
  caution: "A corpus authored from folder names mirrors the tree and hides the units readers actually need."
  anti: "One doc per source folder with a glob for every leaf"
  good: "Coherent units mapped by domain and intent, with the grammar template as the shape authority"

@rule docs/drift
  directive: must
  statement: "Drift is reconciled from the change delta, never from memory: the status-prefixed git delta feeds ctx docs check with BOTH halves in one stream (the repository's code delta and the workspace's own docs/workspace/ delta); every affected doc is updated in the same change, uncovered paths widen a unit's sources or open a new unit, and the audit and the check re-run clean before the doc change lands."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "Any code change inside a documented repository."
  evidence: ".contexture/modules/docs/scripts/docs-check.awk"
  enforced_at: [.contexture/modules/docs/scripts/docs-check.awk, .contexture/modules/docs/scripts/gate, .contexture/rhythms/docs-drift.md]
  caution: "Two ways this check reports a result that is not the truth. A code-only stream can never pass: the check marks a file fresh only when a doc path appears in the SAME stdin, so omitting the docs half reports every claimed file stale forever, whatever the docs say; the stale count then says nothing about the work. And a name-only delta carries no deletion marker, so deleted files read as uncovered."
  anti: "Shipping a code change and deferring its doc update to a later commit; or verifying with a pipeline that feeds the check the code delta alone, which cannot exit 0 by construction"
  good: "Both halves in one stream, records split so a rename's old path surfaces as a dead source (the working command is in the two-sided delta paragraph of plugins/docs-discipline/README.md); for an uncommitted working tree, ctx docs gate already aggregates both halves and needs no pipeline"

@rule docs/greppable-evidence
  directive: must
  statement: "Document evidence using greppable code symbols, attributes, or configuration keys, never line numbers."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All @rule, @contract, @stages, and @pitfalls evidence fields."
  evidence: ".contexture/modules/docs/scripts/docs-audit.awk"
  anti: "evidence: 'controllers/feed.cs' with a trailing line number"
  good: "evidence: 'OrderController.ListOrders'"

@rule typography/plain-hyphens
  directive: must
  statement: "Use plain ASCII hyphens only, and never as punctuation: no em dashes, en dashes, or spaced hyphens; commas, colons, periods, or parentheses instead, with hyphens inside compound words only."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All markdown, json, code comments, and commit messages."
  evidence: "AGENTS.local.md @laws dashes"
  anti: "Text that joins clauses with an em dash or a spaced hyphen"
  good: "Text that uses plain hyphens only, inside compound words"

@rule docs/fixed-pitfalls
  directive: must
  statement: "A fixed pitfall is removed (the doc describes current truth); the id retires, never recycled; a behavior change born of the fix lands as a contract @rule; a new pitfall only for a genuinely new surprise, new id; references re-point via a fresh journal entry recording the resolution (append-only; git history holds the removed text)."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All docs/workspace/*.md @pitfalls blocks."
  evidence: ".contexture/modules/docs/scripts/docs-audit.awk"
  caution: "A pitfall morphed in class to keep its journal anchor describes behavior that no longer exists."
  anti: "Reclassifying a fixed bug as a gotcha to preserve its journal anchor."
  good: "Remove the fixed pitfall, retire its id, land the behavior as a contract @rule, and re-point refs from a fresh journal entry."

@rule docs/section-refs
  directive: must
  statement: "References name their target exactly: an entry by its id (rule slug, pitfall id, member), a block by its canonical section address, in-doc #<block> (for example #contract, #patterns, #members) or cross-doc <slug>.md#<block>."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All cross-references inside the docs corpus."
  evidence: ".contexture/modules/docs/scripts/query"
  caution: "Block-level prose like 'see contract' resolves to nothing; narrative 'above/below' mentions stay prose."
  anti: "(see contract) with no block address"
  good: "(see #contract); (see the-record.md#pitfalls)"

@rule git/versioning
  directive: must
  statement: "Version semantics are contractual: MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording; the agent applies PATCH and MINOR at ship, a MAJOR bump takes a human verdict."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "Releases of the convention and its payload."
  evidence: "AGENTS.workspace.md @git version"
  anti: "Renaming a field inside a PATCH release"
  good: "New module shipped as MINOR; wording fix as PATCH"

@rule git/ship-breath
  directive: must
  statement: "A ship is one act: the run green (tests/run.sh), docs sync, commit, push, annotated tag vX.Y.Z, and the CHANGELOG.md section together; every commit in the tag range appears in the section."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "Every release tag in the source repository."
  evidence: "AGENTS.workspace.md @git ship breath"
  caution: "A tag without its CHANGELOG section leaves the range unreadable to adopters."
  anti: "Tagging a release before its docs sync or CHANGELOG section land, or with a red tests/run.sh"
  good: "A green run, docs sync, and CHANGELOG section in the same breath as commit, push, and annotated tag"

@rule docs/docs-sync
  directive: must
  statement: "Every change to base mechanics, scripts, templates, or governance audits and updates README.md and the relevant docs/ pages before ship; no release ships without its documentation updated in the same breath."
  status: followed
  prevalence: universal
  layer: workspace
  provenance: ratified
  scope: "All changes to the engine, modules, templates, and governance material."
  evidence: "AGENTS.workspace.md @laws docs-sync"
  anti: "Shipping a module contract change with README.md and docs/modules.md untouched"
  good: "Path sweeps, README tables, and docs pages updated inside the same commit as the mechanics change"
