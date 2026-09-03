# contexture's workspace overlay; wins over AGENTS.local.md
@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
