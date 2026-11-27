# contexture agentic onboarding guideline

@purpose
  instructions for an agent onboarding contexture into any workspace (greenfield or existing, with or without git).

@modes
  guided (default): active unless the human's prompt specifies familiar mode; never waste a turn asking which mode to use. Speaks in plain English about only what affects the human and their repository (files touched or preserved, real habit conflicts, and plain-word plugin recommendations with host readiness). Hides internal `ctx` CLI commands, `.contexture/tmp/` paths, `@append`/`@replace` mechanics, unit/journal/task slugs, and raw `@proposal` grammar from chat while driving `.contexture/ctx` record verbs internally. Uses ONE confirmation pause (`@propose`) before workspace writes, and closes (`@close`) with a 10 to 15 line plain-English orientation plus an optional Q&A or tour offer.
  familiar: active when the human's prompt requests familiar or fast mode. Skips the introductory brief, conceptual explanations, closing orientation guide, and Q&A tour offer completely. Presents a crisp structured plan summary for a single confirmation go (`@propose`), and closes (`@close`) with a terse 3-line verification receipt.

@phases
  the adoption unit bootstraps at phase 1 and every phase journals as it happens; the record carries the whole history: findings, proposals, verdicts, changes
  1. ISOLATE: verify `.contexture/ctx`, create a dedicated branch when inside a git repository (never onboard on main), verify starting state, bootstrap `adopt-contexture`, and record the active mode (`guided` or `familiar`)
  2. ASSESS: inventory topology, instruction surfaces, harnesses, and live catalog packages; derive the installation plan
  3. PROPOSE: present the derived plan with a single confirmation pause per active mode (`guided` or `familiar`); the human confirms, amends, or discusses; no workspace configuration write before the verdict
  4. EXECUTE: configure, migrate, install confirmed packages, swap the staged loader if preserved, and symlink strictly per the confirmed plan, running the default rhythm; drift halts and re-confirms
  5. VERIFY: run verification queries against the live record (plus `ctx docs gate` when `docs-discipline` is installed in git), clean up ephemeral adoption files, close `adopt-contexture`, and deliver the mode closing (`guided` orientation plus optional Q&A offer, or `familiar` terse receipt) before starting a fresh session

@isolate
  1. confirm `.contexture/ctx` exists and is executable FIRST; once `.contexture/ctx` is verified (and `AGENTS.generated.md` is read), every shell command runs through `.contexture/ctx run` (`@laws#compact-streams`)
  2. check git availability (`.contexture/ctx run git rev-parse --is-inside-work-tree 2>/dev/null`): when not inside a git repository, note non-git workspace, skip branch steps, and bootstrap directly
  3. when inside a git repository: inspect `.contexture/ctx run git status -s`, distinguishing pre-staged adoption files (`.contexture/`, `AGENTS.md`, `AGENTS.generated.md`, `plugins/`) from unrelated uncommitted project changes; halt only if unrelated dirty project files exist
  4. branch (git workspaces): `.contexture/ctx run git checkout -b adopt-contexture` (or team branch convention; carries untracked pre-staged adoption files onto the new branch cleanly); never execute onboarding directly on main/master/production branches
  5. bootstrap the adoption unit: `.contexture/ctx unit bootstrap adopt-contexture "onboard contexture into this workspace"`; the folded A1 receipt records the fresh unit, the objective, and the starting state
  6. journal the phase (`.contexture/ctx unit record`): the active mode (`guided` or `familiar`), the branch or non-git posture, whether a pre-existing `AGENTS.md` was preserved with contexture's loader staged at `.contexture/tmp/AGENTS.loader.md`, and the starting state

@assess
  topology:
    standalone repo: contains application code (src/, package.json, Cargo.toml, pyproject.toml, etc.)
    parent workspace: contains multiple independent repositories as subdirectories
  git: the git package is a choice with no default, and the docs module's git dependency is a fact: its change-aware verbs, the check, the gate, and the drift read git's delta under every driver, and a workspace without git keeps the audit, the query, and the writes and loses the change-aware checks
  instruction stack first: check whether `.contexture/tmp/AGENTS.loader.md` exists (by listing `.contexture/tmp`) before reading it so no speculative read fails when no pre-existing `AGENTS.md` was preserved; read the existing `AGENTS.md` (the untouched root `AGENTS.md` when preserved) and its derivations (`CLAUDE.md`, `GEMINI.md`, harness files) first and whole, since they name the rules that matter and often where the rest live
  know the convention whole: ONBOARDING is the procedure, not the convention: run `.contexture/ctx compose`, read the contexture loader (`AGENTS.md`, or `.contexture/tmp/AGENTS.loader.md` when root `AGENTS.md` was preserved), read `AGENTS.generated.md` at the root whole, and read the upstream README from the URL in `@update` (via web, `.contexture/ctx run curl`, or git if present; if offline, map from `AGENTS.generated.md` and note that upstream README was unreachable)
  discover live catalog packages: run read-only `.contexture/ctx package catalog`, `.contexture/ctx package list`, and `.contexture/ctx package info <name>` for candidate packages to inspect available plugins, what `install.sh` may already have installed, and live host readiness probe results; in `guided` mode, translate findings into plain-English value and readiness lines instead of raw probe dumps
  map from the destination: walk the convention's sections one by one against the workspace's material: for each capability, what feeds it, what conflicts with it, what belongs there; migration follows the destination, never the file list
  governance: map every rule surface against the incoming convention; each contradicts, overlaps, or complements it, and the plan must resolve each one; the stack guides the sweep, the sweep covers what the stack misses (contributing guides, style and lint configs, CI rules, documentation conventions)
  reading budget: rule-bearing surfaces read whole, they are small and dense; structure is derived by listing, never by reading; application code is out of scope
  ask freely: derive what evidence answers, and ask the human what only they know: resolutions, history, intent; a wrong assumption costs more than a question

@modules
  the module catalog: the builtins ship with the base and need no install; the packages install through `.contexture/ctx package install <name>` on the human's go at the act; the human chooses the packages, and the agent reads the installed surfaces through `ctx help --all`; discover available packages and host readiness through `.contexture/ctx package catalog` and `.contexture/ctx package info <name>`, backed by the package manifests under `.contexture/plugins/<name>/manifest` (with `plugins/<name>/manifest` fallback), and the module preambles and package READMEs carry the descriptions the catalog restates.
  builtin unit: the record's 35 operations over the storage layer, one value per artifact: the state, the backlog, the journal, the knowledge, and the lane artifacts that keep the work across compaction and harness change; no install.
  builtin run: the base filter pack: diff, directory listing, and log filters selected by command identity or stream signature, so command output compacts through `ctx run`; filter-only, so it stays silent in `ctx help`; no install.
  builtin lane: the subagent dispatch surface: `ctx lane` create, record, report, and show, each lane's recipe, journal, and report kept as lane artifacts within the unit's record; no install.
  builtin rhythm: the process surface: `ctx rhythm` lists the rhythms with their triggers and activations, shows one whole, and names the rhythm in force with its next gate; no install.
  builtin store: the free container module: `ctx store` declares a container as one record of its `containers` container (a one-line description, a minting, and field lines) and keeps its records through get, list, put, set, delete, check, search, and config, each write checked against the declaration; no install.
  package docs-discipline: the corpus-first documentation discipline: the docs module's read verbs (query, get, search, audit, check, gate, nudge), its schema-checked write verbs, and its close gate over a typed-block corpus; install it when agents should consult a corpus before code; its change-aware checks need git.
  package ast-doc-graph: the AST and documentation graph: index the workspace's TypeScript code and documentation corpus into one queryable graph, then query symbols, call graphs, rules, and pitfalls; install it when the workspace holds TypeScript sources or a corpus to link.
  package toolchain-filters: the toolchain filter pack: pytest, vitest and jest, cargo test, go test, and compiler error filters for `ctx run`; install it when the workspace runs those toolchains, and adopt only the filters its streams match.
  package starter-rhythms: the starter work and debug rhythms, to copy and edit into the workspace's own; install it when no team rhythm emerged from the instruction stack.
  package storage-sqlite: the SQLite storage driver: the record and the corpus in one database, a twin of the posix driver with exact search alike on every driver; install it by name when the workspace wants that store: its install moves the record from posix into the database, with no setting step, and when posix already holds records the installer asks the human whether to back up or delete the posix copy (`--backup-old` or `--delete-old`); it needs `sqlite3` 3.44 or later.
  package git: the git management discipline: the gitignore strategy, the branch and worktree mechanics, and the boot ground check, as a module with its laws and no verbs; a choice with no default, install it when the workspace is a git repository and wants those mechanics; the docs-discipline change-aware checks need git the tool either way.

@propose
  the flow collapses into ONE confirmation pause before any workspace configuration write or package install; every verdict journals into the adoption record
  1. write the internal working `@proposal` draft to `.contexture/tmp/proposal.md` (never paste raw `@proposal` grammar to the human in `guided` mode), and record the pre-pause proposal entry on `adopt-contexture` with `--thread` awaiting human confirmation
  2. ephemeral files guard: `.contexture/tmp/proposal.md` and `.contexture/ONBOARDING.md` are ephemeral adoption files deleted at close, so never bind permanent `--ref` targets on unit entries, tasks, or findings to them; record settled summaries directly in the journal and findings
  3. legacy turn-end pause: legacy turn-end workspace file rules (status files, session notes, changelogs) pause until the confirmation verdict: before that verdict, onboarding progress lives only in `.contexture/tmp/proposal.md` and the adoption unit record
  4. single confirmation pause (by active mode): actually invoke the harness question tool (using multi-select for independent choices such as candidate plugins and symlinks, never grouping compatible plugins into a single radio choice) or, if no question tool exists, end the chat message with explicit choices and a direct go/confirm ask; never end the turn on passive summary text or parenthetical notes without a question-tool call or explicit confirmation prompt; include any discovered multi-step workflows or checklists (proposed as `.contexture/rhythms/<name>.md` files per `@rhythms#placement`, never `@append @laws`) and any real rule conflicts with base `@laws` in the choices so the human settles each one:
     - in `guided` mode: present ONE plain-English message containing (a) a 2 to 3 sentence brief of what contexture brings to this workspace, (b) what files are added or changed vs preserved, (c) any real habit conflicts discovered, (d) plain-word plugin recommendations and host readiness, and (e) any open questions beside the choices they affect; keep internal `ctx` CLI commands, `.contexture/tmp/` paths, `@append`/`@replace` mechanics, and record slugs out of chat; end the turn with the active question tool or explicit confirmation ask
     - in `familiar` mode: skip the brief and present a crisp plan summary (topology, files touched or preserved, candidate plugins, rhythms, gitignore, symlinks, open questions) paired with the question tool or an explicit go/choice ask at the end of the message
  5. once confirmed, update `.contexture/tmp/proposal.md` if answers refined any detail and journal the settled proposal summary and the human's verdict directly into `adopt-contexture`, closing the confirmation `--thread` with `--closes` (no workspace write before confirmation, and never widen exceptions beyond what the human confirmed; an approval ask for an unseen or stale plan is never valid)

@proposal
  @brief
    <what contexture is, what it promises, what it tries to solve, what it provides, and what this workspace gains against its current setup, written for a human who knows nothing about the repo, grounded in the assessment's findings>
  @assessment
    topology: <standalone | parent workspace>, <the evidence>
    instruction stack: <the files read whole>
    rule surfaces: <every surface found, one per line; each contradicts, overlaps, or complements the convention>
  @plan
    staging: <already staged by install.sh (version, catalog at .contexture/plugins/, and whether existing AGENTS.md was preserved with loader at .contexture/tmp/AGENTS.loader.md), or manual staging source>
    packages: <catalog plugins to install on human go, grounded in ctx package catalog probes and ctx package list; none states none>
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
    verify staged payload: confirm `.contexture/ctx` is present and executable (already staged with preserved executable modes by `install.sh`, or extracted manually)
    compose the law layer: `.contexture/ctx compose`; it builds `AGENTS.generated.md` at the root from the core source and the installed modules, and the loader verifies or recomposes it at every boot
    install newly confirmed packages on the human's go: check `.contexture/ctx package list` for any already installed during `install.sh`, then run `.contexture/ctx package install <name>` for each remaining confirmed package (`git` lands `@git` and its boot ground clause); a confirmed driver package (`storage-sqlite`) installs first, before any package that seeds data (`docs-discipline` seeds its conventions doc), so its move finds posix empty and needs no old copy answer; otherwise the installer asks whether to back up or delete the posix copy, and the agent relays that question to the human and passes the answer as `--backup-old` or `--delete-old`, never defaulting it; each install writes its `package.<name>:` line into the workspace configuration, the declaration a fresh clone reinstalls from with one bare `.contexture/ctx package install` on the human's go, which skips driver packages, each installed by name on the human's go since its install moves the record (boot never installs from it)
    workspace configuration: inspect effective settings and declared module schemas with `.contexture/ctx config load` and `.contexture/ctx config schema`, and apply confirmed settings strictly through their owner config verbs (`.contexture/ctx store config`, `.contexture/ctx search config`); the storage driver is no setting: a driver package's install sets it, and a driver's location is given at that install as `--driver-config=<key>=<value>` (`--driver-config=database=<path>` for `storage-sqlite`); never edit workspace configuration by hand
    loader swap: when `install.sh` preserved a pre-existing `AGENTS.md`, move `.contexture/tmp/AGENTS.loader.md` to `AGENTS.md` only after migrating the existing rules into `AGENTS.workspace.md`
  gitignore:
    standalone repo:
      never deny by default (*); do not alter project file tracking
      append personal amendments to existing .gitignore (AGENTS.local.md)
      per confirmed plan: ignore or track .contexture/units/ (and the deprecated .contexture/sessions/ while units remain in it) and .contexture/rhythms/ based on team choice
      always ignore the composed law layer with the root-anchored line /AGENTS.generated.md (built at install and boot, never tracked, never edited); a repository that ignored it at its old place replaces its .contexture/laws/AGENTS.generated.md ignore line with /AGENTS.generated.md once the update compose has removed the legacy file (update step 9, before the step 10 review)
      always ignore the scratch drawer with the line .contexture/tmp/, where the engine stages its own scratch at every call (update step 9)
      track .contexture/config (its package lines declare the installs a clone reproduces) and .contexture/plugins/ (the workspace catalog copy) unless the team explicitly chooses not to vendor the catalog
      when docs-discipline is installed under posix, ignore .contexture/docs/ (the agent-facing corpus, which posix keeps in the drawer as untracked working state by default, while docs/*.md guides stay tracked); a team that chooses to commit its corpus leaves the line out, a choice that turns a later storage driver install into a team decision
      when a storage driver package (`storage-sqlite`) is installed, ignore its database file and that file's -wal and -shm side files, the lines the package README's git ignore step names (or at the place its `storage.database` setting names): the database is never tracked; where the team tracks its record or module data, a driver install is a team decision, since its move leaves those posix files deleted in git's view and each teammate installs the package by name
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
      the catalog at .contexture/plugins/ rides automatically under !.contexture/**
      the generated law layer AGENTS.generated.md sits at the root under the deny-by-default (*), so it stays ignored with no line of its own: whitelist the AGENTS files by name, never with an AGENTS*.md glob, which would track it; a workspace that re-ignored it at its old place drops its .contexture/laws/AGENTS.generated.md re-ignore line once the update compose has removed the legacy file (update step 9, before the step 10 review)
      when docs-discipline is installed under posix, re-ignore the agent-facing corpus beside the scratch drawer: the line .contexture/docs/ follows !.contexture/**, which otherwise re-includes it (the corpus is untracked working state by default, unless the team chooses to commit it), while whitelisting any docs/*.md guides
      when a storage driver package is installed, re-ignore its database file and its -wal and -shm side files beside the scratch drawer: the lines the package README's git ignore step names follow !.contexture/**, which otherwise re-includes them; the record rides !.contexture/** here, so a driver install is a team decision (git sees the posix record deleted, and each teammate installs the package by name)
  migration:
    if existing AGENTS.md, CLAUDE.md, or other instruction files exist:
      extract discovered multi-step workflows and checklists into `.contexture/rhythms/<name>.md` per `@rhythms#placement` (`use when:` trigger and numbered `N. GATE: outcome` steps), never placing workflows or checklists in `@append @laws`
      extract project-specific invariants (architecture, test/build commands, code style) into `AGENTS.workspace.md` under appropriate `@append` blocks (`@append @laws`, `@append @layout`, `@append @interact`)
      resolve conflicts with base `@laws` cleanly per the confirmed plan: never append rules that contradict base `@laws` (such as `@laws#compact-streams`) or widen exceptions beyond what the human confirmed
    initialize AGENTS.workspace.md with workspace versioning rules
    initialize AGENTS.local.md with local preferences (plain hyphens, etc.)

@symlink
  strictly per the confirmed plan
  wire harness entry points to AGENTS.md (the loader):
    for each existing harness file identified during assessment, or active harnesses in use (e.g. CLAUDE.md, GEMINI.md):
      replace or point entry file with symlink: `.contexture/ctx run ln -s AGENTS.md <harness-file>`
    propose symlinks to human for any detected agent environments
  if filesystem or OS forbids symlinks: duplicate AGENTS.md or reference it

@verify
  never create a self-referential `verify-and-close` backlog task (verification and closing run here and in `@close`, not as a backlog task)
  1. complete all execution tasks (`.contexture/ctx unit task complete`), land durable findings (`.contexture/ctx unit finding add`), and record the closing event on `adopt-contexture` FIRST (with settled prose, never `--ref` to ephemeral onboarding files), strictly before running `ctx unit load` and `ctx unit audit`
  2. verify the law layer and workspace configuration: `.contexture/ctx compose --check`, run `.contexture/ctx config load` to confirm effective workspace configuration, and confirm root `AGENTS.md` is now the contexture loader with no leftover `.contexture/tmp/AGENTS.loader.md`
  3. run boot load and audit: `.contexture/ctx unit load adopt-contexture` (read every page the map reports) and `.contexture/ctx unit audit adopt-contexture` (must exit 0); make zero record writes (no tasks, findings, or journal entries) after that `ctx unit load` (if any check flags a gap, fix it and re-run `ctx unit load` and `ctx unit audit`)
  4. when `docs-discipline` is installed inside a git repository, run `.contexture/ctx docs gate`
  5. before `.contexture/ctx unit close adopt-contexture`, run `.contexture/ctx run git status` and `.contexture/ctx run git diff` when in a git repository (else summarize changed files) and review them alongside the adoption record with the human

@close
  1. once `@verify` passes on the final record, close `adopt-contexture` (`.contexture/ctx unit close adopt-contexture`)
  2. delete `.contexture/ONBOARDING.md`, `.contexture/tmp/proposal.md`, and any leftover `.contexture/tmp/AGENTS.loader.md` (plus any `ONBOARDING.md` gitignore whitelist line), keeping `.contexture/plugins/`
  3. deliver the mode closing:
     - `guided`: a 10 to 15 line plain-English orientation covering what changes in the next chat, 3 tiny habits (start named work, confirm before edits, handoff or close before wrapping up), 1 plain line per installed add-on (or a core-only note), and 1 workspace-tailored starter prompt for the next chat, plus an optional Q&A or quick tour offer before starting a fresh agent session on the new `AGENTS.md` loader from turn 1
     - `familiar`: a terse 3-line verification receipt (summary of applied changes and installed plugins, compose plus audit status, and reminder to start a fresh session on the new `AGENTS.md` loader from turn 1) with zero orientation or tour offer
