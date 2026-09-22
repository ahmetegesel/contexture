# doc grammar

blocks at column 0; fields indent 2; block scalar bodies indent 4;
one blank line between blocks.
evidence is strictly greppable code symbols, never line numbers.
rules use unique addressable slugs (@rule <category>/<rule-slug>).
pitfalls are unified in @pitfalls with full triggers and consequences.
cross-references: an entry by its id; a block by #<block> in-doc or <slug>.md#<block> cross-doc (docs/workspace/conventions.md @rule docs/section-refs).

# kind definitions:
#   conventions   = normative rules for repo or workspace
#   architecture  = reflective technical layers, lifecycles, deployables, data flows
#   operational   = run, build, test, debug, and observability commands
#   overview      = orientation, system entrypoints, and caveats
#   capability    = coherent unit representing a vertical business slice
#   structural    = coherent unit representing a mechanical layer or platform API
#   cross-cutting = coherent unit representing transverse concerns across capabilities
#   catalog       = family manager managing multi-member groups via regex
#
# keywords: required on unit, catalog, and operational docs; optional on
#   conventions, architecture, and overview docs

# --- 1. COHERENT UNIT / CATALOG SHAPE ---

@doc <capability|structural|cross-cutting|catalog> <slug>
  repo: <repo-name>
  [role: <role-name>]
  description: "summary statement of what this document covers"
  sources: [<glob-pattern>, ...]
  keywords: [<keyword>, ...]
  [upstream: "upstream system or layering constraints"]
  [parent: <slug>]
  [children: [<slug>, ...]]

[@responsibilities
  - "statement of what this unit owns and guarantees"
  - "statement of business logic delegation"]

[@contract
  # Checkable business invariants, state schemas (addressing keys and lifecycles), calculation formulas, validation sets, and ordering/uniqueness guarantees:
  - rule: "rule statement"
    evidence: "greppable code symbol or config key"
    [detail ::
      continuation detail explaining the invariant, state key schemas, calculation equations,
      allowed value sets/enums, single-writer invariants, and edge conditions]
    [absence_scope: [<path-glob>, ...]]]

[@dependencies
  # Inbound and outbound dependencies, including external legacy scripts, cross-boundary parameter/secret exports, and cloud resources:
  - target: <target-unit-or-package>
    nature: internal | external
    why: "why this dependency is permitted and used, including payload schema or secret structure if external"]

[@edges
  # Active communication boundaries (requests and event streams); verify that declared edges reflect live wire reality rather than dead/unused client imports:
  - direction: exposes | consumes
    via: http | graphql | amqp | grpc | ftp | ws | events | streams
    key: "route, query name, queue, or topic"
    detail: "protocol details, serialization, and wire status (active vs dormant/dead code)"]

[@pitfalls
  # Failure modes, silent truncations, cache staleness, batch failure routing (e.g. lack of partial batch reporting), and hardcoded fallback landmines:
  - id: <slug>-p<N>
    summary: "short pitfall statement"
    class: bug | tech-debt | gotcha | drift-risk
    severity: low | medium | high | critical
    trigger: "action, parameter, or condition causing the issue"
    consequence: "failure behavior, status code, data inconsistency"
    evidence: "greppable code symbol where issue originates"]
# lifecycle: a fixed pitfall is removed and its id retires (never recycled); a behavior change born of the fix lands as a contract @rule; a new pitfall only for a genuinely new surprise; references re-point via a fresh journal entry (see docs/workspace/conventions.md @rule docs/fixed-pitfalls)

[@patterns
  - name: "design pattern name"
    mechanic: "how the pattern is instantiated in code"
    where: [<file.cs>, ...]
    [gotcha: "local exception or subtle nuance"]
    [diverges_from_convention: "known deviation note"]]

[@see_also
  - ref: <related-slug>
    why: "relationship to this unit"]

# catalog-only blocks (for kind: catalog):
[@member_source
  pattern: "regex-with-exactly-one-capture-group"
  sources: [<file-glob>, ...]]

[@members
  - name: <MemberClassName>
    note: "brief description of member"
    sources: [<file-path>]]

# --- 2. NORMATIVE CONVENTIONS SHAPE (conventions.md) ---

@doc conventions conventions
  repo: workspace | <repo-name>
  description: "summary statement of normative rules"
  sources: [<manifest-files>, ...]
  [keywords: [<convention-keywords>, ...]]

@rule <category>/<rule-slug>
  directive: must | should | never
  statement: "clear, declarative rule statement"
  status: followed | aspirational | violated
  prevalence: universal | dominant | rare
  layer: workspace | repo
  provenance: extracted | ratified
  [scope: "exact scope where rule applies"]
  [exception: "permitted exception and rationale"]
  [caution: "risk or common pitfall if violated"]
  [enforced_at: [<path>, ...]]
  evidence: "greppable code symbol, attribute, or config key"
  [anti: "code snippet showing violation"]
  [good: "code snippet showing compliant implementation"]

# --- 3. REFLECTIVE ARCHITECTURE / SYSTEM MAP SHAPE ---
# For a single repository / internal code: architecture.md (@layers, @stages, @deployables, @data_flow, @dependency_rules)
# For a workspace / multi-component map: system-map.md (@components, @stages, @data_flow, @dependency_rules)

@doc architecture <architecture|system-map>
  repo: workspace | <repo-name>
  description: "architectural structure, components, layers, and data flows"

[@components
  - name: "component or repo name"
    repo: <repo-name> | workspace
    kind: <component-kind>
    stack: "runtime and framework summary"
    responsibilities: "summary of component domain and ownership"
    [sources: [<glob-pattern>, ...]]]

[@layers
  - name: "layer name"
    order: <N>
    responsibilities: "layer responsibility summary"
    allowed_dependencies: [<layer-name>, ...]
    path_patterns: [<glob>, ...]

@stages
  - stage: "lifecycle stage name"
    order: <N>
    description: "stage description"
    evidence: "greppable code symbol"

@deployables
  - name: "deployable name"
    type: "Web API | Worker Service | Static Site | Web App"
    runtime: "<runtime stack and version>"
    entrypoint: "entrypoint file or container CMD"
    evidence: "pipeline or dockerfile symbol"
    detail ::
      pipeline, port, and hosting detail

@data_flow
  - from: "source component"
    to: "destination component"
    evidence: "greppable code symbol"
    detail ::
      protocol, caching, tenant resolution, rollback

@dependency_rules
  - rule: "layer or dependency constraint statement"
    evidence: "ProjectReference or package import symbol"
    detail ::
      enforcement details and pipeline filters

# --- 4. OPERATIONAL SHAPE (operational.md) ---

@doc operational operational
  repo: <repo-name>
  description: "how to run, build, test, debug, and observe"

@run
  - step: "short step name"
    evidence: "greppable code symbol or config key"
    detail ::
      the command line, its prerequisites, ports, environment notes,
      and any operational hazards / downstream overload risks with required throttling mitigations

@build
  - step: "short step name"
    evidence: "greppable code symbol or config key"
    detail ::
      the build command, its toolchain, and the produced artifacts

@test
  - step: "short step name"
    evidence: "greppable code symbol or config key"
    detail ::
      the suite command and how to target a single test

@debug
  - step: "short step name"
    evidence: "greppable code symbol or config key"
    detail ::
      launch profiles, attach ports, or the debugging procedure

@observability
  - step: "short step name"
    evidence: "greppable code symbol or config key"
    detail ::
      log sinks and levels, trace sinks, or health endpoints

# --- 5. OVERVIEW SHAPE (overview.md) ---

@doc overview overview
  repo: <repo-name>
  description: "high-level orientation and entry points"

@areas
  - area: "area name"
    axis: mechanism | capability
    overview: "high-level summary"
    points_to: <doc-slug>

@caveats
  - id: <slug>-c<N>
    text: "operational or architectural caveat"
