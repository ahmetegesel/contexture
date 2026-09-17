# Worktree lane isolation: an optional setup

This folder holds an optional workspace setup and a plain-language
explanation of it. The convention ships no standing requirement for
worktrees: by default every subagent works in the workspace checkout on its
current branch. This setup exists for the units where isolation earns
its keep: parallel work that risks collisions, a tree that should stay
stable while a subagent experiments, or a branch that should land through its
own review. Adopt it when that need appears, not before.

## What it is

Two overlay blocks and one guard file.

- `AGENTS.workspace.md` carries the two blocks: the `@append @subagents`
  block (the recipe names the branch/worktree; the unit's worktree when
  isolation warrants; landing and drift) and the `@append @git` block
  (the on-demand mechanics, the cleanup order, the prune).
- `.worktrees/.gitignore` holds `*` plus `!.gitignore`, so worktrees stay
  invisible to `git status` in workspaces that do not deny by default.

## How to adopt it

Merge the blocks into your workspace's `AGENTS.workspace.md` (or copy
this folder's `AGENTS.workspace.md` whole where none exists), and copy
the `.worktrees/` folder with it. Nothing else changes: the work rhythm
stays as it is, and the session record always lives in the main
checkout.

## Using it, once

When a unit warrants isolation, the dispatcher gives it
`.worktrees/<unit>` on branch `unit/<slug>` and every subagent of the unit
works there. Landing stays the dispatcher's: review the branch (or its
PR), merge, remove the worktree, delete the branch. Cleanup order:
`git worktree remove .worktrees/<unit>`, then
`git branch -d unit/<slug>`; `git worktree prune` clears stale metadata.

## Status

This setup reflects the configuration in force in the contexture
workspace itself. It has not yet been exercised in a real run here, so
copy it knowing it is young. Nothing about it is required by the
convention: it is a setup your workspace opts into.
