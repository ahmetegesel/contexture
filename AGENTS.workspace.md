# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  8. installs: no install without the human's explicit go at the act, no matter what - a spec, plan, rhythm, or README naming the setup is never the go; a lane that finds an install needed stops and reports, never installs

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  ship breath: commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section
