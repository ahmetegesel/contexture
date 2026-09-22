@rhythm work
  use when: a work request arrives in a workspace with a docs corpus and no other rhythm matches
  activation: propose
  1. GATHER: the user's intent, constraints, and pointers, plus a recon subagent's facts and open questions; the map first (the index and the owning docs), the repo only for what the docs lacked
  2. DISCUSS: the dialogue; revealed facts, constraints, and decisions journal as they surface
  3. DECIDE: the human verdict; the backlog lands comprehensively: the specification and the execution blueprint
  4. GROUND: ground subagents verify the plan against the docs and the repo; per-task corrections return
  5. AMEND: corrections land in place; material changes return to the human
  6. EXECUTE: one subagent per task (small same-shape tasks batch); parallel on independence; the doc change lands with its code change (docs-are-code)
  7. GUARDS: the mechanical checks green before any review (ctx docs audit over the corpus, ctx docs check over the delta; the change's own checks)
  8. REVIEW+HARDEN+VERIFY: one fresh subagent; independent review, findings hardened, the docs gate re-proven (ctx docs audit, ctx docs check, ctx docs gate)
  9. LAND: one act after the gates green, the human's sign-off first (the shape lives in @git)
  10. REFRESH: run @refresh
  ground: the rules live in docs/workspace/conventions.md; the grammar in .contexture/templates/doc.md
