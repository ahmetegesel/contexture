@doc structural the-engine
  repo: workspace
  description: "The ctx engine: discovery, help assembly, dispatch, the run selection body, and the hook runner"
  sources: [base/.contexture/ctx]
  keywords: [engine, discovery, dispatch, help, run, hooks, filters]

@responsibilities
  - "Owns discovery over the drawer's modules/ directory, help assembly, verb validation and dispatch, the run selection body, and hook execution"
  - "Ships in the tracked payload at base/.contexture/ctx and runs in a live install at .contexture/ctx; discovery is relative to the drawer it sits in, so the payload discovers base/.contexture/modules/ and the live install discovers .contexture/modules/"
  - "Keeps modules free of dispatch code: modules declare, the engine assembles"

@contract
  - rule: "Discovery lists a module when its directory carries a module file with a # summary: line; a scripts/ directory without a module file warns and skips; a filter-only or hook-only directory is legal, silent, and unlisted."
    evidence: "module_names"
  - rule: "Reserved names (the session verb set plus help, plus refresh, run, and hooks) are refused at discovery; the builtin session and run directories are exempt."
    evidence: "is_reserved"
  - rule: "A module's verbs are its extension-less scripts carrying a # summary: header, name-sorted in LC_ALL=C order; a file without a summary stays private; a duplicate verb shadows with a warning and the first file name wins."
    evidence: "verb_names"
  - rule: "Help is engine-owned: ctx help lists the modules, ctx <module> help renders the verb table, ctx <module> help <verb> renders that verb's usage and help lines, and a scripts/help file is ignored with a warning."
    evidence: "show_verb_help"
  - rule: "Dispatch validates the verb before exec; an unknown verb or module exits rc1 with the module help on stderr, and bare ctx <module> prints its help rc0."
    evidence: "verb_exists"
  - rule: "Dispatch chdirs to the workspace root and exports CTX_ROOT, CTX_MODULE_DIR, CTX_BIN, and LC_ALL=C before exec'ing scripts/<verb> with the remaining argv; arguments, streams, and the exit code pass through."
    evidence: "CTX_MODULE_DIR"
  - rule: "ctx run selects by the wrapped command's identity first (the # command: header), then by the stream signature sampled from the first 40 lines; module filters scan after the run module's own, first match wins, and a later match warns as a shadow unless it declares # ctx-filter-priority: over."
    evidence: "directive_value"
  - rule: "The run guards are strict: empty or grown output falls back to raw, a shrinking filter without a notice line falls back to raw unless it declares # format-only, and a notice-only output passes through so a false-green signal is never hidden."
    evidence: "format_only"
  - rule: "Hook files under modules/*/hooks/ declare # ctx-hook: <point>; the runner executes them in module-name then file-name order with CTX_HOOK_POINT and the point's context exported, cwd at the workspace root."
    evidence: "run_hooks"
  - rule: "A failing hook warns on stderr and the remaining hooks still run, the point's rc unaffected; a hook file carrying # ctx-hook-mode: block stops the point at its first failure and fails rc1."
    evidence: "ctx-hook-mode"
  - rule: "Capture scratch prefers the live workspace's gitignored .contexture/tmp/ and falls back to TMPDIR only when that drawer cannot hold it."
    evidence: "compact_tmpdir"

@dependencies
  - target: "session module"
    nature: internal
    why: "Provides the ctx session verb set that reserved-name discovery derives, and the call sites that fire the stamp, task-landing, close, load, and refresh hooks through CTX_BIN"
  - target: "run module"
    nature: internal
    why: "A filter-only module whose filters/ directory is scanned first for stream compaction"
  - target: "POSIX sh, sed, grep, awk"
    nature: external
    why: "The zero-dependency contract: the engine runs on core OS utilities, and nothing is installed"

@pitfalls
  - id: the-engine-p1
    summary: "A module file without a # summary: line silently disappears from ctx help"
    class: gotcha
    severity: medium
    trigger: "Creating a module directory but forgetting or mistyping the summary line"
    consequence: "The module is unlisted and dispatching its name exits rc1, as if it did not exist"
    evidence: "module_names"
  - id: the-engine-p2
    summary: "A custom filter that shrinks the stream without a notice line reverts to raw output"
    class: gotcha
    severity: low
    trigger: "Dropping lines in a filter without an ellipsis or a bracketed marker line"
    consequence: "The reduction silently does not apply and the raw stream passes through"
    evidence: "format_only"
  - id: the-engine-p3
    summary: "Hooks fire only through the engine: running scripts/<verb> directly skips them silently"
    class: gotcha
    severity: low
    trigger: "Invoking a verb script standalone, outside ctx dispatch, with CTX_BIN unset"
    consequence: "The implicit hook side effects do not run and no warning says so"
    evidence: "CTX_BIN"

@see_also
  - ref: modules
    why: "The module authoring contract: anatomy, declarations, wrappers, hooks, and filters"
  - ref: the-record
    why: "The record grammar the session module serves"
