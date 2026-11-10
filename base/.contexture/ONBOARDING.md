# contexture agentic onboarding guideline

@purpose
  instructions for an agent onboarding contexture into any repository (greenfield or existing).

@phases
  the adoption unit bootstraps at phase 1 and every phase journals as it happens; the record carries the whole history: findings, proposals, verdicts, changes
  1. ISOLATE: create a dedicated branch; never onboard on main; bootstrap the adoption unit
  2. ASSESS: inventory topology, instruction surfaces, and harnesses; derive the installation plan
  3. PROPOSE: present the derived plan; the human confirms, amends, or discusses; no workspace write before the verdict
  4. EXECUTE: configure, migrate, and symlink strictly per the confirmed plan, running the default rhythm; drift halts and re-confirms
  5. VERIFY: run the queries against the live record, confirm clean boot

@isolate
  1. inspect git: `git status -s`; halt if uncommitted changes exist
  2. branch: `git checkout -b adopt-contexture` (or team branch convention)
  3. never execute onboarding directly on main/master/production branches
  4. bootstrap the adoption unit: `.contexture/ctx unit bootstrap adopt-contexture "onboard contexture into this repository"`; the folded A1 receipt records the fresh unit, the objective, and the git state
  5. journal the phase (`.contexture/ctx unit record`): the branch and the starting git state

@assess
  topology:
    standalone repo: contains application code (src/, package.json, Cargo.toml, pyproject.toml, etc.)
    parent workspace: contains multiple independent repositories as subdirectories
  git: the git package is a choice with no default, and the docs module's git dependency is a fact: its change-aware verbs, the check, the gate, and the drift read git's delta, the change log stamps the workspace git HEAD, and a workspace without git keeps the audit, the query, and the writes and loses the change-aware checks
  instruction stack first: the existing AGENTS.md and its derivations (CLAUDE.md, GEMINI.md, harness files) are the workspace's self-description: read them first and whole; they name the rules that matter and often where the rest live
  know the convention whole: ONBOARDING is the procedure, not the convention: run `.contexture/ctx compose`, then read the loader, the generated law layer `AGENTS.generated.md` at the root, and the upstream README completely before mapping; fetch upstream, the URL lives in the generated layer's @update section, and the README carries the philosophy behind every judgment the mapping makes
  map from the destination: walk the convention's sections one by one against the workspace's material: for each capability, what feeds it, what conflicts with it, what belongs there; migration follows the destination, never the file list
  governance: map every rule surface against the incoming convention; each contradicts, overlaps, or complements it, and the plan must resolve each one; the stack guides the sweep, the sweep covers what the stack misses (contributing guides, style and lint configs, CI rules, documentation conventions)
  reading budget: rule-bearing surfaces read whole, they are small and dense; structure is derived by listing, never by reading; application code is out of scope
  ask freely: derive what evidence answers, and ask the human what only they know: resolutions, history, intent; a wrong assumption costs more than a question

@modules
  the module catalog: the builtins ship with the base and need no install; the packages install through `.contexture/ctx package install <name>` on the human's go at the act; the human chooses the packages, and the agent reads the installed surfaces through `ctx help --all`; the module files and the package manifests under `plugins/<name>/manifest` carry the summaries and versions, and the module preambles and package READMEs carry the descriptions the catalog restates.
  builtin unit: the record's 35 operations over the store, one value per artifact: the state, the backlog, the journal, the knowledge, and the lane artifacts that keep the work across compaction and harness change; no install.
  builtin run: the base filter pack: diff, directory listing, and log filters selected by command identity or stream signature, so command output compacts through `ctx run`; filter-only, so it stays silent in `ctx help`; no install.
  builtin lane: the subagent dispatch surface: `ctx lane` create, record, report, and show, each lane's recipe, journal, and report kept as lane artifacts within the unit's record; no install.
  builtin rhythm: the process surface: `ctx rhythm` lists the rhythms with their triggers and activations, shows one whole, and names the rhythm in force with its next gate; no install.
  package docs-discipline: the corpus-first documentation discipline: the docs module's read verbs (query, audit, check, gate, nudge, changes), its schema-checked write verbs, and its close gate over a typed-block corpus; install it when agents should consult a corpus before code; its change-aware checks need git.
  package ast-doc-graph: the AST and documentation graph: index the workspace's TypeScript code and documentation corpus into one queryable graph, then query symbols, call graphs, rules, and pitfalls; install it when the workspace holds TypeScript sources or a corpus to link.
  package toolchain-filters: the toolchain filter pack: pytest, vitest and jest, cargo test, go test, and compiler error filters for `ctx run`; install it when the workspace runs those toolchains, and adopt only the filters its streams match.
  package starter-rhythms: the starter work and debug rhythms, to copy and edit into the workspace's own; install it when no team rhythm emerged from the instruction stack.
  package storage-fts5: the SQLite FTS5 storage driver: the record and the corpus in one store with dual full-text indexing and exact, hybrid, and trigram search; install it when the workspace wants that store; it needs `sqlite3` 3.44 or later with FTS5.
  package git: the git management discipline: the gitignore strategy, the branch and worktree mechanics, and the boot ground check, as a module with its laws and no verbs; a choice with no default, install it when the workspace is a git repository and wants those mechanics; the docs-discipline change-aware checks need git the tool either way.

@propose
  the flow runs in two segments; each ends at a gate that hands control to the human and waits: ask in chat and end the turn; the gate is the loop's exit, never skipped, never merged; every gate and verdict journals into the adoption record

  segment one, the ground:
    1. fill the assessment and the brief in the proposal shape; the filled grammar is the working copy, tmp holds it
    2. gate: present the brief and the assessment findings and ask the human to approve the plan preparation; on approve, run segment two; on discuss, answer and re-gate

  segment two, the plan:
    3. write the pre-plan into the proposal grammar: readable prose per the shape's plan fields, never the raw dialect
    4. forward the open questions through the harness's question tool when it has one; each question carries the plan context it touches; free text when it does not
    5. update the proposal per the answers: never an approval ask for an unseen or stale plan
    6. gate: present the final plan and request the verdict on it only: no write before it; the human confirms, amends, or discusses; ambiguity surfaces here, never mid-execution

@proposal
  @brief
    <what contexture is, what it promises, what it tries to solve, what it provides, and what this workspace gains against its current setup, written for a human who knows nothing about the repo, grounded in the assessment's findings>
  @assessment
    topology: <standalone | parent workspace>, <the evidence>
    instruction stack: <the files read whole>
    rule surfaces: <every surface found, one per line; each contradicts, overlaps, or complements the convention>
  @plan
    copy: <the adoption set, derived from the tag: git archive <tag> base/; never a hand-kept list>
    overlay: <AGENTS.workspace.md @append blocks, which existing rules migrate where; none states none>
    local: <AGENTS.local.md preferences; none states none>
    rhythms: <work patterns found in the stack: each becomes a rhythm file proposal; none states none>
    units: <existing unit folders, under the record root or the deprecated sessions root: adopted, archived, or left; none states none>
    symlinks: <harness entry points to wire; none states none>
    gitignore: <the strategy per topology>
    git: <the git package: install it or leave it out; no default; the docs-discipline module's change-aware checks need git>
    deletions: <existing rules superseded by the convention; none states none>
    untouched: <what deliberately stays outside contexture>
  @questions
    <every open question beside the plan: resolutions, history, intent the evidence cannot answer; none states none>

@configure
  strictly per the confirmed plan; drift halts and re-confirms; run the default rhythm: the confirmed tasks land in the backlog via `.contexture/ctx unit task add`; the move is the backlog's first IN_PROGRESS task, else its first open task (every status but DONE), and `.contexture/ctx unit list` derives it (a task start moves the task: `.contexture/ctx unit task start`); every task's completion journals its receipt (`.contexture/ctx unit task complete`) and the derived move advances with the backlog; drift updates the backlog in the same breath via `.contexture/ctx unit task update`
  base assets:
    copy the adoption set: `git archive <tag> base/ | tar -x -C <scratch>`; copy the base content into the target root (`cp -R <scratch>/base/. <target>/`); base/ mirrors the target, so AGENTS.md lands at the root and the drawer alongside it
    set script permissions: `chmod +x .contexture/ctx .contexture/modules/*/scripts/* .contexture/modules/*/filters/*.awk .contexture/extensions/modules/*/scripts/*`
    compose the law layer: `.contexture/ctx compose`; it builds `AGENTS.generated.md` at the root from the core source and the installed modules, and the loader verifies or recomposes it at every boot
    install the chosen packages on the human's go: `.contexture/ctx package install git` lands the git package's `@git` section and boot ground clause; any other chosen package installs the same way
  gitignore:
    standalone repo:
      never deny by default (*); do not alter project file tracking
      append personal amendments to existing .gitignore (AGENTS.local.md)
      per confirmed plan: ignore or track .contexture/units/ (and the deprecated .contexture/sessions/ while units remain in it) and .contexture/rhythms/ based on team choice
      always ignore the composed law layer with the root-anchored line /AGENTS.generated.md (built at install and boot, never tracked, never edited); a repository that ignored it at its old place replaces its .contexture/laws/AGENTS.generated.md ignore line with /AGENTS.generated.md once the update compose has removed the legacy file (update step 9, before the step 10 review)
      always ignore the scratch drawer with the line .contexture/tmp/, where the engine stages its own scratch at every call (update step 9)
    parent workspace:
      deny-by-default (*) allowed only if repo tracks contexture configuration alone
      whitelist shared files explicitly:
        !.gitignore
        !AGENTS.md
        !AGENTS.workspace.md
        !README.md
        !.contexture/
        !.contexture/**
        (and active harness symlinks: !CLAUDE.md, !GEMINI.md)
      re-ignore the scratch drawer after the whitelist: the line .contexture/tmp/ follows !.contexture/**, which otherwise re-includes it, the later line winning (update step 9)
      the generated law layer AGENTS.generated.md sits at the root under the deny-by-default (*), so it stays ignored with no line of its own: whitelist the AGENTS files by name, never with an AGENTS*.md glob, which would track it; a workspace that re-ignored it at its old place drops its .contexture/laws/AGENTS.generated.md re-ignore line once the update compose has removed the legacy file (update step 9, before the step 10 review)
  migration:
    if existing AGENTS.md, CLAUDE.md, or other instruction files exist:
      extract project-specific guidelines (architecture, test/build commands, code style)
      place into AGENTS.workspace.md under appropriate @append blocks (@append @laws, etc.)
    initialize AGENTS.workspace.md with workspace versioning rules
    initialize AGENTS.local.md with local preferences (plain hyphens, etc.)

@symlink
  strictly per the confirmed plan
  wire harness entry points to AGENTS.md (the loader):
    for each existing harness file identified during assessment, or active harnesses in use (e.g. CLAUDE.md, GEMINI.md):
      replace or point entry file with symlink: `ln -s AGENTS.md <harness-file>`
    propose symlinks to human for any detected agent environments
  if filesystem or OS forbids symlinks: duplicate AGENTS.md or reference it

@verify
  1. verify the law layer: `.contexture/ctx compose --check` (the loader composes or verifies it at boot; a refused compose is a broken payload, its error line naming the missing or refused path)
  2. run boot load: `.contexture/ctx unit load adopt-contexture` (read every page the map reports)
  3. run audit: `.contexture/ctx unit audit adopt-contexture` (must exit 0)
  4. review with human: `git status`, `git diff`, and the adoption record; present for review and PR merge

@close
  delete .contexture/ONBOARDING.md once the adoption closes: adoption material, not the convention; remove any ONBOARDING gitignore whitelist line with it
