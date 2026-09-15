# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  installs: no install without the human's explicit go at the act, no matter what: a spec, plan, rhythm, or README naming the setup is never the go; a lane that finds an install needed asks the main agent for steering where the harness supports a channel, else stops gracefully and reports, never installs
  background-subagents: subagents and lanes run strictly in the background; the turn ends immediately at launch and never blocks the conversation, sleeps, or polls for completion; work continues or the turn yields so the harness wakes reactively on message delivery.
  docs-sync: every change to base mechanics, scripts, templates, or governance audits and updates README.md and relevant docs/ before ship; no release ships without its documentation updated in the same breath.

@append @boot
  the ground check lists worktrees beside git status: a worktree with no live lane folder is debt

@append @subagents
  lane roots: a lane may run in its own git worktree, .worktrees/<lane>; the recipe names it in WRITE_SCOPE beside the lane folder; the lane boots read-only against the session surfaces in the main tree, works and commits in the worktree; its report names the branch and the tip commit
  landing: the dispatcher owns it: review the branch (or its PR), merge, remove the worktree, delete the branch; a lane never merges or prunes
  drift: an edit outside the declared roots, or a worktree change without its journal line, is drift

@append @refresh
  worktrees: git worktree list joins the sweep; a worktree whose lane closed or whose branch merged prunes in the same breath

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  ship breath: docs sync + commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section
  worktrees: under .worktrees/ (inside the workspace, never a sibling); one branch per lane, lane/<slug>; push -u origin lane/<slug> when a PR is wanted; cleanup order: git worktree remove .worktrees/<lane>, then git branch -d lane/<slug>; git worktree prune clears stale metadata
