# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  installs: no install without the human's explicit go at the act, no matter what: a spec, plan, rhythm, or README naming the setup is never the go; a subagent that finds an install needed asks the main agent for steering where the harness supports a channel, else stops gracefully and reports, never installs
  background-subagents: subagents run strictly in the background; the turn ends immediately at launch and never blocks the conversation, sleeps, or polls for completion; work continues or the turn yields so the harness wakes reactively on message delivery.
  docs-sync: every change to base mechanics, scripts, templates, or governance audits and updates README.md and relevant docs/ before ship; no release ships without its documentation updated in the same breath.
  workspace-tmp: scratch (mktemp, fixtures, short-lived files) lives in .contexture/tmp/ when the workspace is writable (gitignored; engines prefer it as TMPDIR); never route temp content outside the workspace while that drawer can hold it.
  docs-first: prompt -> map -> doc -> code behavioral first move: every task begins with the whole picture, the index (ctx docs query --index: the repos and units that exist; read whole, never capped, the "index complete" marker proves it) and the general-level docs (workspace conventions, the repo's overview and operational docs), before any specific lookup; then the owning doc: the query line -> doc -> section; read code only for what the doc lacked; the doc is ground truth, trust or fix, never work around; a read the docs do not serve is correct (census, existence, enumeration, absence); docs rank, cap and explain, they never count; doc vs code: code wins on what IS, the doc on why and intent; no question to the human the docs answer; TEST: would the doc have answered this? yes -> stop reading code
  docs-are-code: a doc'd change lands with its doc update, same change, on the spot, never deferred; git versions both, one history, nothing waits; close-time verifies, it never updates; a doc-vs-code conflict you notice is real, the doc fix rides the same change
  gap: a path no doc owns, or a doc that lags code, is a finding; stub it or record the gap in the same unit of work, silence is the only failure; what the doc lacked is the finding, name and capture it; promote it into the owning doc, the update is the promotion; the contract vocab lives in .contexture/templates/doc.md, one home
  harness-free: the agent's docs duties never assume the harness; the contract runs on plain files and plain POSIX tools
  dont-fool-yourself: every failure here returns something indistinguishable from a correct result; none of them error; care does not catch them, only a mechanical check does; null-check the instrument: would it give the same answer if the thing sought did not exist? then it cannot discriminate, and it is not evidence; grep LOCATES, read ANSWERS: matched lines are not the file's answer, a later block may reverse them, grep -m1 returns whichever sorts first; absence claims are the highest-evidence claim available, never the easiest, they license deletion; split a whole into parts, assert the parts SUM to the whole and NAME the remainder; report an exit code you actually read: in a pipeline it belongs to the last command, not the one you care about; TEST: primary record, or a view derived from it? derived -> read the primary

@append @layout
  .contexture/templates/doc.md: the corpus grammar, the authoring contract
  docs/workspace/conventions.md: the universal rules for the corpus
  .contexture/modules/docs/: the corpus module: the verbs ctx docs query, audit, check, gate, nudge (ctx docs help lists them)

@append @backlog
  ideas: IDEAS.md is the upstream idea and need dump: ideas and needs land as light @idea entries and are picked up from there; dump freely, the agent appends on the human's word and proposes a dump when a discovery would otherwise die in conversation; loaded on demand only, never at boot; picking up = bootstrap the unit and flip the entry to PICKED <unit>; entries are never deleted

@append @subagents
  branch/worktree: the recipe names the branch/worktree the subagent works on; by default the workspace checkout on its current branch; when a unit warrants isolation the dispatcher gives it .worktrees/<unit> on branch unit/<slug>, and every subagent of the unit works there; the subagent's journal and report stay in the session folder
  landing: the dispatcher owns it: review the branch (or its PR), merge, remove the worktree, delete the branch; a subagent never merges or prunes
  drift: an edit outside the declared roots, a code change without its journal line, or a command run raw without .contexture/ctx run, is drift

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  ship breath: the run green (tests/run.sh) + docs sync + commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section
  changelog: no adopter, project, or personal names; the changelog speaks the convention's vocabulary, the record carries the names
  branch/worktree on demand: create .worktrees/<unit> on branch unit/<slug> when isolation helps; push -u origin unit/<slug> when a PR is wanted; the branch merges per the workspace's flow and the worktree prunes after; cleanup order: git worktree remove .worktrees/<unit>, then git branch -d unit/<slug>; git worktree prune clears stale metadata

@append @boot
  boot order addition: cross-repo overview map via ctx docs query --index, the index loads whole, never truncated (it ends with "index complete: N entries"; a missing marker means it was truncated, re-read it whole), then the entering repo's docs (retrieval at session start)

@append @close
  docs gate (unit close): ctx docs gate must pass cleanly, chaining the audit (the corpus grammar and integrity) and the check (coverage completeness and doc freshness); a unit does not close red; the gate verifies change, never truth
