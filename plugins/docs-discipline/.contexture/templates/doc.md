# doc grammar

blocks at column 0; fields indent 2; block scalar bodies indent 4;
one blank line between blocks.
evidence is strictly greppable code symbols, never line numbers.
rules use unique addressable slugs (@rule <category>/<rule-slug>).
pitfalls are unified in @pitfalls with full triggers and consequences.
cross-references: an entry by its id; a block by #<block> in-doc or <slug>.md#<block> cross-doc (docs/workspace/conventions.md @rule docs/section-refs).
the machine-readable schema at the foot (section 6, every line prefixed #%) restates these shapes one line each for the write verbs, and the plugin suite's agreement check keeps it, this prose, and the audit in step.

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
    [id: <slug>-o<N>]
  - "statement of business logic delegation"
    [id: <slug>-o<N>]]

[@contract
  # Checkable business invariants, state schemas (addressing keys and lifecycles), calculation formulas, validation sets, and ordering/uniqueness guarantees:
  - rule: "rule statement"
    [id: <slug>-r<N>]
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

# --- 6. MACHINE-READABLE SCHEMA ---
# The shapes above, restated one line each for the write verbs; the prose explains,
# the #% lines parse. The line grammar:
#   #% kinds <kind>...                                  the doc kinds
#   #% header <field> <type> <presence> [<values>]      the @doc header fields, in order
#   #% requires <kind>... header <field>                a header field required on those kinds
#   #% block <name> <shape> [first=<field>] [key=<key>] [order=<N>]
#        shape: map (fields at indent 2) or list (entries at indent 2, fields at indent 4);
#        first: an entry's first field; key: id, a field name, <f1>+<f2>, or none (ordinal
#        only); order: the block's position when a verb creates it
#   #% field <block> <field> <type> <presence> [<values>]
#        type: word, text, list, enum, int, id, bare (a responsibilities item's text);
#        presence: required, optional, new (required on a new entry, absent on a legacy one)
#   #% allows <kind>... blocks <block>...               which blocks a kind carries
#% kinds capability structural cross-cutting catalog conventions architecture operational overview
#% header repo word required
#% header role word optional
#% header description text required
#% header sources list optional
#% header keywords list optional
#% header upstream text optional
#% header parent word optional
#% header children list optional
#% requires capability structural cross-cutting catalog conventions header sources
#% requires capability structural cross-cutting catalog operational header keywords
#% block responsibilities list first=text key=id order=1
#% field responsibilities text bare required
#% field responsibilities id id new
#% block contract list first=rule key=id order=2
#% field contract rule text required
#% field contract id id new
#% field contract evidence text required
#% field contract detail text optional
#% field contract absence_scope list optional
#% block dependencies list first=target key=target order=3
#% field dependencies target word required
#% field dependencies nature enum required internal external
#% field dependencies why text required
#% block edges list first=direction key=direction+key order=4
#% field edges direction enum required exposes consumes
#% field edges via enum required http graphql amqp grpc ftp ws events streams
#% field edges key text required
#% field edges detail text required
#% block pitfalls list first=id key=id order=5
#% field pitfalls id id required
#% field pitfalls summary text required
#% field pitfalls class enum required bug tech-debt gotcha drift-risk
#% field pitfalls severity enum required low medium high critical
#% field pitfalls trigger text required
#% field pitfalls consequence text required
#% field pitfalls evidence text required
#% block patterns list first=name key=name order=6
#% field patterns name text required
#% field patterns mechanic text required
#% field patterns where list required
#% field patterns gotcha text optional
#% field patterns diverges_from_convention text optional
#% block see_also list first=ref key=ref order=7
#% field see_also ref word required
#% field see_also why text required
#% block member_source map order=8
#% field member_source pattern text required
#% field member_source sources list required
#% block members list first=name key=name order=9
#% field members name word required
#% field members note text required
#% field members sources list required
#% block rule map order=10
#% field rule directive enum required must should never
#% field rule statement text required
#% field rule status enum required followed aspirational violated
#% field rule prevalence enum required universal dominant rare
#% field rule layer enum required workspace repo
#% field rule provenance enum required extracted ratified
#% field rule scope text optional
#% field rule exception text optional
#% field rule caution text optional
#% field rule enforced_at list optional
#% field rule evidence text required
#% field rule anti text optional
#% field rule good text optional
#% block components list first=name key=name order=11
#% field components name text required
#% field components repo word required
#% field components kind word required
#% field components stack text required
#% field components responsibilities text required
#% field components sources list optional
#% block layers list first=name key=name order=12
#% field layers name text required
#% field layers order int required
#% field layers responsibilities text required
#% field layers allowed_dependencies list required
#% field layers path_patterns list required
#% block stages list first=stage key=stage order=13
#% field stages stage text required
#% field stages order int required
#% field stages description text required
#% field stages evidence text required
#% block deployables list first=name key=name order=14
#% field deployables name text required
#% field deployables type text required
#% field deployables runtime text required
#% field deployables entrypoint text required
#% field deployables evidence text required
#% field deployables detail text required
#% block data_flow list first=from key=from+to order=15
#% field data_flow from text required
#% field data_flow to text required
#% field data_flow evidence text required
#% field data_flow detail text required
#% block dependency_rules list first=rule key=none order=16
#% field dependency_rules rule text required
#% field dependency_rules evidence text required
#% field dependency_rules detail text required
#% block run list first=step key=step order=17
#% block build list first=step key=step order=18
#% block test list first=step key=step order=19
#% block debug list first=step key=step order=20
#% block observability list first=step key=step order=21
#% field run|build|test|debug|observability step text required
#% field run|build|test|debug|observability evidence text required
#% field run|build|test|debug|observability detail text required
#% block areas list first=area key=area order=22
#% field areas area text required
#% field areas axis enum required mechanism capability
#% field areas overview text required
#% field areas points_to word required
#% block caveats list first=id key=id order=23
#% field caveats id id required
#% field caveats text text required
#% allows capability structural cross-cutting catalog blocks responsibilities contract dependencies edges pitfalls patterns see_also
#% allows catalog blocks member_source members
#% allows conventions blocks rule
#% allows architecture blocks components layers stages deployables data_flow dependency_rules
#% allows operational blocks run build test debug observability
#% allows overview blocks areas caveats
