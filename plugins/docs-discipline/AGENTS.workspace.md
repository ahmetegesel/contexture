# docs-discipline: the optional docs setup
# merge these blocks into your workspace's AGENTS.workspace.md, or copy this
# file whole where none exists; see README.md beside it

@append @laws
  docs-first: prompt -> map -> doc -> code behavioral first move: every task begins with the whole picture, the index (ctx docs query --index: the repos and units that exist; read whole, never capped, the "index complete" marker proves it) and the general-level docs (workspace conventions, the repo's overview and operational docs), before any specific lookup; then the owning doc: the query line -> doc -> section; read code only for what the doc lacked; the doc is ground truth, trust or fix, never work around; a read the docs do not serve is correct (census, existence, enumeration, absence); docs rank, cap and explain, they never count; doc vs code: code wins on what IS, the doc on why and intent; no question to the human the docs answer; TEST: would the doc have answered this? yes -> stop reading code
  docs-are-code: a doc'd change lands with its doc update, same change, on the spot, never deferred; git versions both, one history, nothing waits; close-time verifies, it never updates; a doc-vs-code conflict you notice is real, the doc fix rides the same change
  gap: a path no doc owns, or a doc that lags code, is a finding; stub it or record the gap in the same unit of work, silence is the only failure; what the doc lacked is the finding, name and capture it; promote it into the owning doc, the update is the promotion; the contract vocab lives in .contexture/templates/doc.md, one home
  harness-free: the agent's docs duties never assume the harness; the contract runs on plain files and plain POSIX tools
  dont-fool-yourself: every failure here returns something indistinguishable from a correct result; none of them error; care does not catch them, only a mechanical check does; null-check the instrument: would it give the same answer if the thing sought did not exist? then it cannot discriminate, and it is not evidence; grep LOCATES, read ANSWERS: matched lines are not the file's answer, a later block may reverse them, grep -m1 returns whichever sorts first; absence claims are the highest-evidence claim available, never the easiest, they license deletion; split a whole into parts, assert the parts SUM to the whole and NAME the remainder; report an exit code you actually read: in a pipeline it belongs to the last command, not the one you care about; TEST: primary record, or a view derived from it? derived -> read the primary

@append @layout
  .contexture/templates/doc.md: the corpus grammar, the authoring contract
  docs/workspace/conventions.md: the universal rules for the corpus
  .contexture/modules/docs/: the corpus module: the verbs ctx docs query, audit, check, gate, nudge (ctx docs help lists them)

@append @boot
  boot order addition: cross-repo overview map via ctx docs query --index, the index loads whole, never truncated (it ends with "index complete: N entries"; a missing marker means it was truncated, re-read it whole), then the entering repo's docs (retrieval at session start)

@append @close
  docs gate (unit close): ctx docs gate must pass cleanly, chaining the audit (the corpus grammar and integrity) and the check (coverage completeness and doc freshness); a unit does not close red; the gate verifies change, never truth
