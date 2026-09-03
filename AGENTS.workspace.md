# contexture's workspace overlay: the workspace's own rules; tracked; wins over AGENTS.local.md; grammar in templates/overlay.md
@append @git
  versioning is semantic: MAJOR = breaking for existing artifacts (fields removed, shapes changed); MINOR = new sections and features; PATCH = fixes and wording.
  the agent holds the bump judgment for PATCH and MINOR and applies it at ship time as work lands; no ask needed.
  a MAJOR bump is the human's verdict alone: the agent proposes with the reasoning, never applies it.
