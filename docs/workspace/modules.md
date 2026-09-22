@doc structural modules
  repo: workspace
  description: "The workspace modules: session and run ship in the tracked payload at base/.contexture/modules/, ideas and docs install live-only under .contexture/modules/; modules declare, the engine assembles"
  sources: [base/.contexture/modules/**, tests/**]
  keywords: [modules, session, run, ideas, docs, filters, hooks, wrappers]

@responsibilities
  - "Own the ctx verb namespaces, hook declarations, and filter packs of the workspace"
  - "Declare only: modules carry no dispatch code, and the engine owns discovery, help, validation, dispatch, and hook execution"

@contract
  - rule: "A module is a directory under the drawer's modules/ root (base/.contexture/modules/ for the shipped session and run modules, .contexture/modules/ in the live install) whose module file is literally named module and carries one # summary: line; the directory name is the module name."
    evidence: "module"
  - rule: "scripts/<verb> is a verb when its header carries a # summary: line, named by file name; # usage: and # help: lines repeat for the verb's detail; a file without a summary is private and never listed."
    evidence: "header_field"
  - rule: "Wrappers over a private implementation are the pattern for similar verbs: session and ideas keep their logic in a summary-less private engine and one thin wrapper per verb execs it with its act name."
    evidence: "record"
  - rule: "A filter declares # command: for wrapped-command identity or # match: for a stream signature; # ctx-filter-priority: over replaces an earlier match, a shadow without it warns, and the first match wins."
    evidence: "ctx-filter-priority"
  - rule: "Hook files declare # ctx-hook: <point> and optionally # ctx-hook-mode: block; the shipped points are stamp, task-landing, close, load-pre, load-post, and refresh, and boot is not a point."
    evidence: "ctx-hook"
  - rule: "The session module derives its reserved verb set from its own scripts/, so a module shadowing a session verb is refused at discovery; the builtin session and run directories are exempt."
    evidence: "load_session_verbs"
  - rule: "tests/filter-tests.sh stages the tracked base engine (base/.contexture/ctx plus the base run filters) into a sandbox that mirrors the live layout (the runtime at .contexture/ctx, the run module's filters, a staged toolchain-filters module) and byte-compares every fixture pair through ctx run --filter=<filter>."
    evidence: "SANDBOX"

@dependencies
  - target: "ctx engine"
    nature: internal
    why: "Discovery, help assembly, verb validation, dispatch, environment export, and the hook runner; modules never call each other for dispatch"
  - target: "POSIX awk and sh"
    nature: external
    why: "Every verb and filter is a plain script over core utilities, keeping the workspace zero-install"

@pitfalls
  - id: modules-p1
    summary: "A scripts/ directory without a module file warns and the whole module stays undiscoverable"
    class: gotcha
    severity: medium
    trigger: "Adding verb scripts under a new live .contexture/modules/<name>/scripts/ before writing the module file"
    consequence: "The engine skips the module with a warning on discovery; no verb dispatches"
    evidence: "module_names"
  - id: modules-p2
    summary: "A module named after a session verb or another reserved name is refused at discovery"
    class: gotcha
    severity: medium
    trigger: "Naming a module directory 'refresh', 'run', 'hooks', or a shipped session verb"
    consequence: "The reserved-name warning prints on every dispatch attempt and the module never lists"
    evidence: "is_reserved"
  - id: modules-p3
    summary: "A private implementation file that gains a # summary: line silently becomes a public verb"
    class: drift-risk
    severity: low
    trigger: "Copying a header into the private engine while editing it"
    consequence: "An unintended verb appears in ctx <module> help and dispatches without a wrapper's validation"
    evidence: "verb_names"

@see_also
  - ref: the-engine
    why: "The discovery, assembly, dispatch, run, and hook mechanics the modules declare into"
  - ref: plugins
    why: "Packaging a module as a distributable plugin"
