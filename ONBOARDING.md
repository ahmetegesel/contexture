# contexture agentic onboarding guideline

@purpose
  instructions for an agent onboarding contexture into any repository (greenfield or existing).

@phases
  1. ISOLATE: create a dedicated branch; never onboard on main
  2. ASSESS: inventory topology, instruction surfaces, and harnesses; derive the installation plan
  3. PROPOSE: present the derived plan; the human confirms, amends, or discusses; no write before the verdict
  4. EXECUTE: configure, migrate, and symlink strictly per the confirmed plan; drift halts and re-confirms
  5. VERIFY: bootstrap initial session, execute query scripts, confirm clean boot

@isolate
  1. inspect git: `git status -s`; halt if uncommitted changes exist
  2. branch: `git checkout -b adopt-contexture` (or team branch convention)
  3. never execute onboarding directly on main/master/production branches

@assess
  topology:
    standalone repo: contains application code (src/, package.json, Cargo.toml, pyproject.toml, etc.)
    parent workspace: contains multiple independent repositories as subdirectories
  instruction stack first: the existing AGENTS.md and its derivations (CLAUDE.md, GEMINI.md, harness files) are the workspace's self-description - read them first and whole; they name the rules that matter and often where the rest live
  know the convention whole: ONBOARDING is the procedure, not the convention - read the base AGENTS.md and the upstream README completely before mapping; fetch upstream, the URL lives in the base AGENTS.md's @update section, and the README carries the philosophy behind every judgment the mapping makes
  map from the destination: walk the convention's sections one by one against the workspace's material - for each capability, what feeds it, what conflicts with it, what belongs there; migration follows the destination, never the file list
  governance: map every rule surface against the incoming convention - each contradicts, overlaps, or complements it, and the plan must resolve each one; the stack guides the sweep, the sweep covers what the stack misses (contributing guides, style and lint configs, CI rules, documentation conventions)
  reading budget: rule-bearing surfaces read whole, they are small and dense; structure is derived by listing, never by reading; application code is out of scope
  ask freely: derive what evidence answers, and ask the human what only they know - resolutions, history, intent; a wrong assumption costs more than a question

@propose
  fill the proposal shape below whole: every field answered, none states none; a surface absent from the proposal is an unresolved conflict
  the filled grammar is the working copy - tmp holds it; the human reads prose: present the same content as readable prose organized by the shape's sections, never the raw dialect
  forward the open questions through the harness's question tool when it has one - the human answers in place; free text when it does not
  no write before the verdict; the human confirms, amends, or discusses; ambiguity surfaces here, never mid-execution

@proposal
  @assessment
    topology: <standalone | parent workspace> - <the evidence>
    instruction stack: <the files read whole>
    rule surfaces: <every surface found, one per line; each contradicts, overlaps, or complements the convention>
  @plan
    copy: <the shared set; always AGENTS.md, ONBOARDING.md, templates/, scripts/>
    overlay: <AGENTS.workspace.md @append blocks - which existing rules migrate where; none states none>
    local: <AGENTS.local.md preferences; none states none>
    rhythms: <work patterns found in the stack - each becomes a rhythm file proposal; none states none>
    sessions: <existing session folders - adopted, archived, or left; none states none>
    symlinks: <harness entry points to wire; none states none>
    gitignore: <the strategy per topology>
    deletions: <existing rules superseded by the convention; none states none>
    untouched: <what deliberately stays outside contexture>
  @questions
    <every open question beside the plan: resolutions, history, intent the evidence cannot answer; none states none>

@configure
  strictly per the confirmed plan; drift halts and re-confirms
  base assets:
    copy AGENTS.md, ONBOARDING.md, templates/, and scripts/ into repo root
    set script permissions: `chmod +x scripts/*.awk`
  gitignore:
    standalone repo:
      never deny by default (*); do not alter project file tracking
      append private contexture paths to existing .gitignore:
        sessions/
        rhythms/
        AGENTS.local.md
      if team opts to track session history: whitelist !sessions/ and !sessions/**
    parent workspace:
      deny-by-default (*) allowed only if repo tracks contexture configuration alone
      whitelist shared files explicitly:
        !.gitignore
        !AGENTS.md
        !AGENTS.workspace.md
        !ONBOARDING.md
        !README.md
        !scripts/
        !scripts/**
        !templates/
        !templates/**
        (and active harness symlinks: !CLAUDE.md, !GEMINI.md)
  migration:
    if existing AGENTS.md, CLAUDE.md, or other instruction files exist:
      extract project-specific guidelines (architecture, test/build commands, code style)
      place into AGENTS.workspace.md under appropriate @append blocks (@append @laws, etc.)
    initialize AGENTS.workspace.md with workspace versioning rules
    initialize AGENTS.local.md with local preferences (plain hyphens, etc.)

@symlink
  strictly per the confirmed plan
  wire harness entry points to base AGENTS.md:
    for each existing harness file identified during assessment, or active harnesses in use (e.g. CLAUDE.md, GEMINI.md):
      replace or point entry file with symlink: `ln -s AGENTS.md <harness-file>`
    propose symlinks to human for any detected agent environments
  if filesystem or OS forbids symlinks: duplicate AGENTS.md or reference it

@verify
  1. create sessions/ directory
  2. bootstrap initial session:
     write sessions/adopt-contexture/state.md: status: ACTIVE, current_anchor: A0, next_action: "verify onboarding"
     initialize sessions/adopt-contexture/journal.md with `@anchor A0 ("initial bootstrap", attention: none)`
  3. run boot query: `awk -f scripts/journal-active.awk sessions/adopt-contexture/journal.md sessions/adopt-contexture/journal.md`
  4. run audit: `awk -f scripts/journal-dangling.awk sessions/adopt-contexture/journal.md` (must exit 0)
  5. review diff with human: `git status`, `git diff`; present for review and PR merge
