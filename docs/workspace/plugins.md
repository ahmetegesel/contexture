@doc structural plugins
  repo: workspace
  description: "The packaged plugin frame: five mirror-anatomy bundles adopted by copy, each with a README and a plugin-root suite"
  sources: [plugins/**]
  keywords: [plugins, adoption, mirror-anatomy, tests, docs-discipline, packaging]

@responsibilities
  - "Own the distributable extension bundles: starter-rhythms, toolchain-filters, lane-isolation, docs-discipline, and ast-doc-graph"
  - "Keep each plugin self-describing: a README with adoption, needs, and contribution, and a suite at the plugin root that runs by convention"

@contract
  - rule: "The plugin root mirrors the target tree: only README.md and tests/ are plugin-meta, and every other path lands in an adopting workspace at the same relative path."
    evidence: "plugins/docs-discipline/README.md"
  - rule: "The docs-discipline plugin ships the docs module; its adopted copy lives in the live drawer at .contexture/modules/docs with the five verb scripts and the private awk engines."
    evidence: ".contexture/modules/docs/scripts/gate"
  - rule: "A plugin's suite lives at plugins/<name>/tests/ and is never copied into a workspace; a suite with a declared need absent skips cleanly by exit 77, naming the need."
    evidence: "exit 77"
  - rule: "The workspace adopts a plugin by copying its mirrored .contexture/ subtree into the live drawer and merging its AGENTS.workspace.md fragments; the plugin folder stays the tracked distributable catalog copy."
    evidence: "plugins/docs-discipline/AGENTS.workspace.md"
  - rule: "Packaging guidance lives in docs/plugins.md (anatomy, naming, adoption, the test convention) and module authoring in docs/modules.md."
    evidence: "docs/plugins.md"

@dependencies
  - target: "ctx engine"
    nature: internal
    why: "Every plugin that ships verbs rides engine dispatch; a copy never edits the engine"
  - target: "docs module"
    nature: internal
    why: "The adopted docs module turns the docs-discipline plugin from reference material into the workspace's live corpus discipline"

@pitfalls
  - id: plugins-p1
    summary: "A local edit to a copied plugin module silently diverges from the distributable copy"
    class: drift-risk
    severity: medium
    trigger: "Patching a copied module in place without re-applying the change to the plugin or recording the delta"
    consequence: "A future re-copy overwrites the local adaptation; the plugin and the workspace disagree unrecorded"
    evidence: "plugins/docs-discipline/README.md"
  - id: plugins-p2
    summary: "A plugin suite that does not declare its needs cannot skip cleanly"
    class: gotcha
    severity: low
    trigger: "Referencing an external toolchain or pilot repository without a declared NEEDS check"
    consequence: "The suite fails instead of exiting 77, and the runner reads it as a real regression"
    evidence: "exit 77"

@see_also
  - ref: modules
    why: "The module authoring contract a plugin packages"
  - ref: conventions
    why: "The docs-sync and release rules that keep plugin READMEs current with their mechanics"
