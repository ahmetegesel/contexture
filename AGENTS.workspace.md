# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  installs: no install without the human's explicit go at the act, no matter what: a spec, plan, rhythm, or README naming the setup is never the go; a subagent that finds an install needed asks the main agent for steering where the harness supports a channel, else stops gracefully and reports, never installs
  background-subagents: subagents run strictly in the background; the turn ends immediately at launch and never blocks the conversation, sleeps, or polls for completion; work continues or the turn yields so the harness wakes reactively on message delivery.
  docs-sync: every change to base mechanics, scripts, templates, or governance audits and updates README.md and relevant docs/ before ship; no release ships without its documentation updated in the same breath.
  workspace-tmp: scratch (mktemp, fixtures, short-lived files) lives in .contexture/tmp/ when the workspace is writable (gitignored; engines prefer it as TMPDIR); never route temp content outside the workspace while that drawer can hold it.
  test-scope: run only the tests the change makes necessary: during the work the area's vitest project, one file, or one test (from tests/: bun run test:<project>, bun run test:changed, or vitest run --project <project> <file> -t "<name>"), the docs audit and check, and the change's own probes; the full suite (bun run test:prerelease from tests/) runs only before a release, on the staged payload; no container matrix runs (the static awk census guards portability)
  corpus-untracked-here: under the files driver this repository's agent-facing corpus is gitignored working state at docs/workspace/, and its guides (docs/*.md plus README.md) stay tracked files
  inner-workings: a feature's inner workings are known only inside its implementation; every user or agent facing act goes through ctx; shipped agent facing text names no record storage path or module implementation path (the governance surface census and the verb output census hold it) and no private tool path (the forbid census holds it)

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  plugin versions: a release that changes a plugin's payload (its installed .contexture tree and any package-root file its part hooks apply at install) bumps that plugin's manifest version by the version rule; the governance plugin-versions check reads red on a staged or committed payload change with an unchanged version
  ship breath: stage the payload first (git add every path that ships, so the governance probe over tracked paths sees what it is about to gate), then the run green (bun run test:prerelease from tests/) + docs sync + commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section; a gate run on an unstaged payload is not the gate
  changelog: no adopter, project, or personal names; the changelog speaks the convention's vocabulary, the record carries the names
