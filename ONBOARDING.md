# contexture agentic onboarding guideline

@purpose
  instructions for an agent onboarding contexture into any repository (greenfield or existing).

@phases
  1. ISOLATE: create a dedicated branch; never onboard on main
  2. ASSESS: identify repository topology and existing instruction surfaces
  3. CONFIGURE: install base assets, migrate existing instructions, adapt .gitignore
  4. SYMLINK: wire active harness entry points to AGENTS.md
  5. VERIFY: bootstrap initial session, execute query scripts, confirm clean boot

@isolate
  1. inspect git: `git status -s`; halt if uncommitted changes exist
  2. branch: `git checkout -b adopt-contexture` (or team branch convention)
  3. never execute onboarding directly on main/master/production branches

@assess
  topology:
    standalone repo: contains application code (src/, package.json, Cargo.toml, pyproject.toml, etc.)
    parent workspace: contains multiple independent repositories as subdirectories
  instructions:
    check for existing instruction files: AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, COPILOT.md, etc.
    never overwrite existing project instructions; extract and preserve them during configuration

@configure
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
