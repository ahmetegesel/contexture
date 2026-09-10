# contexture agentic onboarding guideline

@purpose
  instructions for an agent onboarding contexture into any repository (greenfield or existing).

@phases
  the adoption session bootstraps at phase 1 and every phase journals as it happens - the record carries the whole history: findings, proposals, verdicts, changes
  1. ISOLATE: create a dedicated branch; never onboard on main; bootstrap the adoption session
  2. ASSESS: inventory topology, instruction surfaces, and harnesses; derive the installation plan
  3. PROPOSE: present the derived plan; the human confirms, amends, or discusses; no workspace write before the verdict
  4. EXECUTE: configure, migrate, and symlink strictly per the confirmed plan, running the default rhythm; drift halts and re-confirms
  5. VERIFY: run the queries against the live record, confirm clean boot

@isolate
  1. inspect git: `git status -s`; halt if uncommitted changes exist
  2. branch: `git checkout -b adopt-contexture` (or team branch convention)
  3. never execute onboarding directly on main/master/production branches
  4. bootstrap the adoption session:
     write .contexture/sessions/adopt-contexture/state.md: status: ACTIVE, current_anchor: A0, next_action: "assess the workspace"
     initialize journal.md with `@anchor A0 ("onboarding starts", attention: none)`
  5. journal the phase: the branch and the starting git state

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
  the flow runs in two segments; each ends at a gate that hands control to the human and waits - ask in chat and end the turn; the gate is the loop's exit, never skipped, never merged; every gate and verdict journals into the adoption record

  segment one - the ground:
    1. fill the assessment and the brief in the proposal shape; the filled grammar is the working copy, tmp holds it
    2. gate: present the brief and the assessment findings and ask the human to approve the plan preparation; on approve, run segment two; on discuss, answer and re-gate

  segment two - the plan:
    3. write the pre-plan into the proposal grammar: readable prose per the shape's plan fields, never the raw dialect
    4. forward the open questions through the harness's question tool when it has one - each question carries the plan context it touches; free text when it does not
    5. update the proposal per the answers: never an approval ask for an unseen or stale plan
    6. gate: present the final plan and request the verdict on it only - no write before it; the human confirms, amends, or discusses; ambiguity surfaces here, never mid-execution

@proposal
  @brief
    <what contexture is, what it promises, what it tries to solve, what it provides, and what this workspace gains against its current setup - written for a human who knows nothing about the repo, grounded in the assessment's findings>
  @assessment
    topology: <standalone | parent workspace> - <the evidence>
    instruction stack: <the files read whole>
    rule surfaces: <every surface found, one per line; each contradicts, overlaps, or complements the convention>
  @plan
    copy: <the shared set; always AGENTS.md and .contexture/>
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
  strictly per the confirmed plan; drift halts and re-confirms; run the default rhythm: the confirmed tasks land in backlog.md, next_action points at the active task, every task's completion journals and advances next_action, drift updates the backlog in the same breath
  base assets:
    copy AGENTS.md into the repo root and .contexture/ alongside it
    set script permissions: `chmod +x .contexture/scripts/*.awk`
  gitignore:
    standalone repo:
      never deny by default (*); do not alter project file tracking
      append personal amendments to existing .gitignore (AGENTS.local.md)
      per confirmed plan: ignore or track .contexture/sessions/ and .contexture/rhythms/ based on team choice
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
  1. run boot query: `awk -f .contexture/scripts/journal-active.awk .contexture/sessions/adopt-contexture/journal.md .contexture/sessions/adopt-contexture/journal.md`
  2. run audit: `awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/adopt-contexture/journal.md` (must exit 0)
  3. review with human: `git status`, `git diff`, and the adoption record; present for review and PR merge

@close
  delete .contexture/ONBOARDING.md once the adoption closes - it is the procedure, not the convention; remove its gitignore whitelist line with it
