# git: the git management package

The git package carries the adopter's git management as a module with its laws
and no verbs: the gitignore strategy, the branch and worktree mechanics, and the
boot ground check. The core names no git, and a workspace without the package
keeps the generic reconcile step.

## What it gives

The install creates the `@git` section in the law layer, after `@update`, with
the gitignore strategy decided per topology and team choice at onboarding and
the branch and worktree mechanics on demand. It appends one clause to `@boot`:
the ground check for a git workspace, `git status -sb`, the upstream delta, and
git wins over the record. The module lists in `ctx help`; it runs no verb and
ships no code.

| piece | what it is |
|---|---|
| `.contexture/extensions/modules/git/module` | the module summary and description |
| `.contexture/extensions/modules/git/laws` | the `@git` section and the `@boot` ground clause |
| `manifest` | the package manifest, version 1.0.0 |
| `README.md` | this page |

## Adoption

Install it on the human's go at the act. The package is a choice, never a default,
and the onboarding asks for it with no default:

    .contexture/ctx package install git

The install recomposes the law layer. Uninstall it on the same go at the act:

    .contexture/ctx package uninstall git

The layer returns to its pre-install bytes.

## Needs

git the tool, when the workspace is a repository; the package is plain text and
installs nothing. The docs-discipline module's change-aware checks need git the tool
as well: its check, gate, and drift read git's delta and the change log stamps the
workspace git HEAD, so a workspace without git keeps the docs audit, the query, and
the writes and loses the change-aware checks. This package is independent of that module.

## Tests

No suite of its own: a law and preamble package with no code, its install, its
compose after `@update`, and its uninstall are proven by the packages and laws
projects.

## Contributing

Change the module, the laws, or the manifest here, in the upstream copy. A
payload change bumps the manifest and module versions by the version rule; a
change to this README or the tests alone bumps nothing. Keep this page's claims
in step with the laws.
