# lane-isolation: the optional worktree setup
# merge these blocks into your workspace's AGENTS.workspace.md, or copy this
# file whole where none exists; see README.md beside it

@append @subagents
  branch/worktree: the recipe names the branch/worktree the subagent works on; by default the workspace checkout on its current branch; when a unit warrants isolation the dispatcher gives it .worktrees/<unit> on branch unit/<slug>, and every subagent of the unit works there; the subagent's journal and report stay in the session folder
  landing: the dispatcher owns it: review the branch (or its PR), merge, remove the worktree, delete the branch; a subagent never merges or prunes
  drift: an edit outside the declared roots, or a code change without its journal line, is drift

@append @git
  branch/worktree on demand: create .worktrees/<unit> on branch unit/<slug> when isolation helps; push -u origin unit/<slug> when a PR is wanted; the branch merges per the workspace's flow and the worktree prunes after; cleanup order: git worktree remove .worktrees/<unit>, then git branch -d unit/<slug>; git worktree prune clears stale metadata
