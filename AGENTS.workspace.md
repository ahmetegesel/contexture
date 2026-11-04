# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  installs: no install without the human's explicit go at the act, no matter what: a spec, plan, rhythm, or README naming the setup is never the go; a subagent that finds an install needed asks the main agent for steering where the harness supports a channel, else stops gracefully and reports, never installs
  background-subagents: subagents run strictly in the background; the turn ends immediately at launch and never blocks the conversation, sleeps, or polls for completion; work continues or the turn yields so the harness wakes reactively on message delivery.
  docs-sync: every change to base mechanics, scripts, templates, or governance audits and updates README.md and relevant docs/ before ship; no release ships without its documentation updated in the same breath.
  workspace-tmp: scratch (mktemp, fixtures, short-lived files) lives in .contexture/tmp/ when the workspace is writable (gitignored; engines prefer it as TMPDIR); never route temp content outside the workspace while that drawer can hold it.
  test-scope: run only the tests the change makes necessary: the targeted suites, the docs audit and check, and the change's own probes during the work; the full gate (tests/run.sh) runs only before landing a new version, on the staged payload
  corpus-untracked-here: under the files driver this repository's agent-facing corpus is gitignored working state at docs/workspace/, and its guides (docs/*.md plus README.md) stay tracked files

@append @backlog
  ideas: the upstream idea and need dump is managed and queried strictly through the ideas module (ctx ideas list, show, add, pick, drop); ideas land as light @idea entries and are picked up from there; dump freely, the agent appends on the human's word and proposes a dump when a discovery would otherwise die in conversation; loaded on demand only via ctx ideas show <slug>, never at boot; picking up = bootstrap the unit and flip the entry to PICKED <unit>; entries are never deleted

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  ship breath: stage the payload first (git add every path that ships, so the governance probe over tracked paths sees what it is about to gate), then the run green (tests/run.sh) + docs sync + commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section; a gate run on an unstaged payload is not the gate
  changelog: no adopter, project, or personal names; the changelog speaks the convention's vocabulary, the record carries the names
