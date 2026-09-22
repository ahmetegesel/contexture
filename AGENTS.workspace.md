# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  installs: no install without the human's explicit go at the act, no matter what: a spec, plan, rhythm, or README naming the setup is never the go; a subagent that finds an install needed asks the main agent for steering where the harness supports a channel, else stops gracefully and reports, never installs
  background-subagents: subagents run strictly in the background; the turn ends immediately at launch and never blocks the conversation, sleeps, or polls for completion; work continues or the turn yields so the harness wakes reactively on message delivery.
  docs-sync: every change to base mechanics, scripts, templates, or governance audits and updates README.md and relevant docs/ before ship; no release ships without its documentation updated in the same breath.

@append @backlog
  ideas: IDEAS.md is the upstream idea and need dump: ideas and needs land as light @idea entries and are picked up from there; dump freely, the agent appends on the human's word and proposes a dump when a discovery would otherwise die in conversation; loaded on demand only, never at boot; picking up = bootstrap the unit and flip the entry to PICKED <unit>; entries are never deleted

@append @subagents
  branch/worktree: the recipe names the branch/worktree the subagent works on; by default the workspace checkout on its current branch; when a unit warrants isolation the dispatcher gives it .worktrees/<unit> on branch unit/<slug>, and every subagent of the unit works there; the subagent's journal and report stay in the session folder
  landing: the dispatcher owns it: review the branch (or its PR), merge, remove the worktree, delete the branch; a subagent never merges or prunes
  drift: an edit outside the declared roots, a code change without its journal line, or a command run raw without .contexture/scripts/compact.sh, is drift

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  ship breath: docs sync + commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section
  changelog: no adopter, project, or personal names; the changelog speaks the convention's vocabulary, the record carries the names
  branch/worktree on demand: create .worktrees/<unit> on branch unit/<slug> when isolation helps; push -u origin unit/<slug> when a PR is wanted; the branch merges per the workspace's flow and the worktree prunes after; cleanup order: git worktree remove .worktrees/<unit>, then git branch -d unit/<slug>; git worktree prune clears stale metadata
