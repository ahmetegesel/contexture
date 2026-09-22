@doc architecture system-map
  repo: workspace
  description: "The contexture workspace map: the tracked base/ payload, the live drawer, the engine, the modules, the record, the corpus, the plugins, and the tests"
  keywords: [workspace, engine, modules, record, corpus, plugins]

@components
  - name: "ctx engine"
    repo: workspace
    kind: runtime
    stack: "POSIX /bin/sh with sed, grep, and awk"
    responsibilities: "Discovery over the drawer's modules/ directory, help assembly, verb validation and dispatch, the run selection body, and hook execution"
    sources: [base/.contexture/ctx]
  - name: "session module"
    repo: workspace
    kind: builtin module
    stack: "POSIX awk scripts, sh wrappers over a private record engine"
    responsibilities: "The record engine: ctx session verbs for reading, writing, auditing, and refreshing the unit of work"
    sources: [base/.contexture/modules/session/**]
  - name: "run module"
    repo: workspace
    kind: filter-only module
    stack: "POSIX awk filters"
    responsibilities: "Stream compaction filters (diff, list, log) that ctx run selects by command identity or stream signature"
    sources: [base/.contexture/modules/run/filters/**]
  - name: "ideas module"
    repo: workspace
    kind: workspace module
    stack: "POSIX sh private engine with sh wrappers"
    responsibilities: "The upstream idea dump: list, show, add, pick, and drop over IDEAS.md at the workspace root"
    sources: [.contexture/modules/ideas/**]
  - name: "docs module"
    repo: workspace
    kind: workspace module
    stack: "POSIX sh wrappers over private awk engines"
    responsibilities: "The corpus discipline: query, audit, check, gate, and nudge over the typed-block documentation corpus"
    sources: [.contexture/modules/docs/**]
  - name: "record"
    repo: workspace
    kind: workspace state
    stack: "plain markdown per the templates"
    responsibilities: "The unit of work: state, backlog, journal, knowledge, and lane folders under the live .contexture/sessions/, unit-owned and never touched by updates"
    sources: [.contexture/sessions/**, base/.contexture/templates/**]
  - name: "corpus"
    repo: workspace
    kind: documentation corpus
    stack: "typed-block markdown per the live .contexture/templates/doc.md"
    responsibilities: "This map, the workspace conventions, and the unit docs describing the repo; the registry ctx docs query serves"
    sources: [docs/workspace/**]
  - name: "plugins"
    repo: workspace
    kind: extension packages
    stack: "mirrored drawer subtrees, each with a README and a test suite"
    responsibilities: "Five distributable bundles (starter-rhythms, toolchain-filters, lane-isolation, docs-discipline, ast-doc-graph) adopted by copy, never installed"
    sources: [plugins/**]
  - name: "tests"
    repo: workspace
    kind: test harness
    stack: "POSIX sh with awk"
    responsibilities: "The upstream test pipeline: tests/run.sh over the six core suites (filters, ctx, session, hooks, record-audit, governance) and the plugin suites by convention; hermetic under the live .contexture/tmp/; upstream-only"
    sources: [tests/**]

@data_flow
  - from: "plugins/docs-discipline"
    to: "workspace drawer"
    evidence: ".contexture/modules/docs/module"
    detail::
      Adoption copies the plugin's mirrored .contexture/ subtree into the live drawer; the plugin folder stays the distributable reference, so a local edit to the copy is a recorded delta, never a silent divergence.

@dependency_rules
  - rule: "The engine depends on no module to dispatch one; every module is discovered from the filesystem and assemblies never run module code."
    evidence: "module_names"
    detail::
      No install step exists: the payload is plain files, and a missing module simply leaves its namespace absent from ctx help.
  - rule: "The shipped core is tracked as a mirror under base/ (base/AGENTS.md, base/.contexture/{ctx,modules/session,modules/run,templates,ONBOARDING.md}); the live root (AGENTS.md, .contexture/) is untracked working state, so the same mechanics are named base/... in the payload and .contexture/... in the live install."
    evidence: ".gitignore"
    detail::
      Source claims follow the class: shipped components claim base/ paths for change coverage (the engine, session, run, and the record's grammar templates), while the live-only components (the ideas and docs modules, the record, the live grammar doc.md, and tmp) stay named at their live .contexture/ paths.
