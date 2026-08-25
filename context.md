# Code Context — Session Artifacts of `opencode-plugins`

Investigation target: `/Users/ahmetegesel/Projects/opencode-plugins` — anatomy of session folders
and the data recorded in `findings.syn` / `plan.syn` / `journal.syn` / `context.syn`.

## Files Retrieved (exact paths)

1. `.context/_template/{context,plan,findings}.syn` — the canonical/template schema (530–602 bytes each).
2. `synaptiq/.context/piri-workspace-analysis/{findings,plan,context,journal}.syn` — a compact, well-formed research session.
3. `synaptiq/.context/deepwiki-open-competitive-analysis/{findings,plan,context,journal}.syn` — a compact research session.
4. `worktrees/brain-center/.context/epic-mvp-implementation/brain-as-center/{findings,plan,context,journal}.syn` — a large, mature implementation session (the 3rd `findings.syn` sample).
5. `worktrees/brain-center/.context/epic-mvp-implementation/brain-as-center/recipes/*.syn` — ~200 recipe files (structure only, not read in full).

### Session-folder discovery
- `.context/` dirs found: `synaptiq/.context`, `worktrees/brain-center/.context`, `references/sigmap/.context` (the last holds no `*.syn`; only `gain.ndjson`, `query-context.md`, `session.json`, `usage.json`).
- Session folders are `.context/<session-slug>/` with subdirs `grounding/`, `recipes/`, and (in the big one) `live-test/`.
- `references/sigmap/.context` contains no session artifacts of the SYN kind.

### 3 most-recently-updated session folders (by max mtime of `*.syn` inside)
| Rank | Session folder | latest mtime | file set |
|---|---|---|---|
| 1 | `worktrees/brain-center/.context/epic-mvp-implementation/brain-as-center/` | 2026-08-19 (~15:31) | context.syn (8,317B), findings.syn (100,838B / 440 lines), plan.syn (20,001B), journal.syn (17,238B), build-ledger.syn (55,327B), THE-DESIGN-AND-PLAN.syn (38,618B), `grounding/`, `recipes/` (~200 files), `live-test/` |
| 2 | `synaptiq/.context/piri-workspace-analysis/` | 2026-08-17 | findings.syn (84 lines), plan.syn (50), context.syn (65), journal.syn (27), REPORT.md (185), `grounding/` (10 reports, 100–449 lines), `recipes/` (13 files) |
| 3 | `synaptiq/.context/deepwiki-open-competitive-analysis/` | 2026-08-17 | findings.syn (67), plan.syn (50), context.syn (66), journal.syn (21), REPORT.md (163), `grounding/` (13 reports), `recipes/` (14 files) |

Note: a `dogfood-our-own-brain/runs` dir has the newest raw mtime but is not itself a session artifact folder.

## Key Code / Formats (verbatim evidence)

### Canonical template (`.context/_template/*.syn`)
- `findings.syn`: `@finding Topic_Name do STATUS: verified  # unverified | verified | promoted \n DETAILS: "..." end` and `@proposal ... do STATUS: pending_user_approval ... DESCRIPTION/TARGET ... end`.
- `plan.syn`: `@section Execution_Steps do STATUS: draft ...` with nested `@section Step_N do STATUS/ACTION/VERIFICATION end`.
- `context.syn`: `@section Session_Name do GOAL/STATUS` with nested `@section Inputs / Actions / Next_Session`.

Real sessions have drifted substantially from these templates (see §Drift).

### findings.syn — TWO coexisting block shapes

**Shape A — `@finding` + fixed KEY: field blocks** (used by the small research sessions).
Verbatim small example — `piri-workspace-analysis/findings.syn`, block `PIRI_REPO_SHAPE`:
```
@finding PIRI_REPO_SHAPE do
  STATUS: open
  KIND: FINDING
  CONFIDENCE: VERIFIED
  CLASS: VERIFIED_GROUNDING
  EVIDENCE_REF: "inventory at session start 2026-08-17 (find/git)"
  SUMMARY: |
    piri-workspace: a Claude Code PLUGIN ('piri-docs') governing an AI-maintained docs corpus.
    Product repos live under projects/ ...
end
```
Verbatim large example — `deepwiki-open-competitive-analysis/findings.syn`, block `DW_ANALYSIS_IS_LLM_READING`:
```
@finding DW_ANALYSIS_IS_LLM_READING do
  STATUS: open
  KIND: FINDING
  CONFIDENCE: VERIFIED
  CLASS: VERIFIED_GROUNDING
  EVIDENCE_REF: "grounding/2026-08-17-02-r2-wiki-core.syn Q1 + r3-rag-chat.syn q1 (...)"
  SUMMARY: |
    deepwiki has NO structural code analysis — pure LLM reading. Structure = LLM XML over file tree ...
```
One outlier block (`SYNAPTIQ_CONVERGENCE_15_MAYBE` in piri) omits `EVIDENCE_REF`, has `KIND: PROPOSAL`, `CONFIDENCE: SPECULATIVE`, `CLASS: DESIGN_SURFACE`, and a long multi-tier SUMMARY.

**Shape B — `@section` + free-form `THE_*` / prose-quote keys** (used by the big brain-as-center session; file header `# @format: SYN v2.0`). Verbatim example (`The_Boot-Unify's_DECIDED`):
```
@section The_Boot-Unify's_DECIDED (the User 2026-08-12: 'Sounds good') do
  STATUS: "DECIDED — the Abstraction lens's item 4 ratified (the lens COMPLETE)"
  THE_SHAPE: "one shared reactor-start routine per stack ... THE COST: a pure move ..."
end
```

### findings.syn field-frequency (per file)
| Field | piri (5 blocks) | deepwiki (6 blocks) | brain-as-center (63 @section blocks) |
|---|---|---|---|
| STATUS | 5 | 6 | 32 |
| SUMMARY | 5 | 6 | 0 |
| KIND | 5 | 6 | 0 |
| CONFIDENCE | 5 | 6 | 0 |
| CLASS | 5 | 6 | 0 |
| EVIDENCE_REF | 4 | 6 | 0 |
| THE_SHAPE | 0 | 0 | 18 |
| THE_DETAILS | 0 | 0 | 7 |
| THE_VERDICT | 0 | 0 | 6 |
| THE_REJECTED / THE_CARRIES | 0 | 0 | 2 each |
| THE_* (one-off, e.g. THE_SPINE, THE_SEAMS, THE_FAMILIES, THE_RUN, THE_FIVE_PROOFS, THE_FINDING, THE_CONTEXT, THE_FROZEN_CORPUS, THE_MONEY, THE_MATRIX, THE_ACCEPTANCE_LIST, …) | 0 | 0 | ~30 distinct, 1 each |
| IMPLEMENT_STATUS / IMPLEMENT_NOTES / IMPLEMENT_JOURNAL_REFS / IMPLEMENT_DATE | 0 | 0 | 1 each |

`@finding` block counts: piri = 5, deepwiki = 6, brain-as-center = **0** (it uses 63 `@section` blocks instead; no `@finding` header at all).

### Content characterization of findings.syn
- **What it records:** verified facts/grounding (CLASS=VERIFIED_GROUNDING), design decisions (`DECIDED — the … item N ratified`), rejected alternatives (THE_REJECTED), research folds, user decisions quoted verbatim (`the User 2026-08-14: 'sounds good'`), open questions, and one "MAYBE"/proposal class (DESIGN_SURFACE). No lessons-learned section type; no explicit verification-result ledger (that lives in `build-ledger.syn` / plan VERIFY lines).
- **Prose length:** Shape A SUMMARY bodies run ~4–15 lines of block text (largest: the `SYNAPTIQ_CONVERGENCE_15_MAYBE` block, ~30 lines). Shape B `THE_*` values are single-line quoted strings up to several sentences each.
- **Tone:** terse, telegraphic, SHOUTED-KEY naming; human-user quotes preserved verbatim; comparisons to the competitor ("a different class of code knowledge", "freshness axis is uncontested").

### plan.syn structure
- **Shape A (piri / deepwiki):** `@section Plan_Index` with fields `SUMMARY` (multi-line), `PHASES:` (a `- "Phase_N: STATUS complete — …"` bullet list), `LANE_MODEL`, `NEXT_MOVE`; followed by `@section Phase_1..4` each with `STATUS`, `RECIPE`, `DELIVERABLE`, and (in some) `DRIVER`, `GATE`, `PREREQ`; plus a `@section Traceability` with `MAP:` bullets.
- **Shape B (brain-as-center):** `@section Plan_Index` (`THE_DEVELOPMENT_PLAN's_HOME`, `THE_PHASES'_STATUS`, `NEXT_MOVE`), `The_Development_Plan` (P0–P7 + THE_PARALLEL_TRACK, each a prose-quote with `VERIFY:`), `The_Traceability` (`THE_DESIGN's_GUIDES`, `THE_PHASES'_ARCHITECTURE_NODES`, `THE_EVIDENCE's_HOME`), `The_Live_Test's_Shape`, `The_Addressing's_Pack` (has `STATUS:`, `THE_SCOPE`, `TRACEABILITY_MAPPING`), `The_Deployment_Problems'_Plan`, `The_Merge's_Retry's_Plan`.
- **How steps are tracked:** each phase section carries STATUS and named VERIFY/gate criteria; the Plan_Index `PHASES:` bullets carry inline "STATUS complete/pending" tags.

### journal.syn shape
- `@entry <slug>` blocks with `STATUS` (closed), `KIND` (success | light_finding), `WHAT` (quoted prose), optional `RESOLUTION: shipped`. brain-as-center journal: 22 entries, each with STATUS/KIND, 18 with WHAT, 6 with RESOLUTION, 1 `CLOSES_WHEN`. piri journal: 4 entries.

### context.syn shape
- Header comment `# @context: <title>`, `# @last_updated`.
- `@state Session do STATUS/CURRENT_ANCHOR/KIND/ORIGIN/MISSION/DELIVERABLE/PROCESS end` (piri); or `@section Session_Name` (brain-as-center).
- `@section Park_Handoff` with `LAST_REFRESHED`, `NEXT_MOVE`, `LAST_COMMIT_*`, `WORKING_TREE_*` — this is the "handoff" shape named in the task. `CURRENT_ANCHOR` present only in piri's `@state Session` (`CURRENT_ANCHOR: A1`).
- Additional `@section` blocks: `Session_Laws`, `Comparison_Axes` (piri), `The_Decisions_So_Far`, `The_Golden_Rules`, `What_This_Session_Is`, `The_Decisions_So_Far`, `TRACK_BACK`, `ROLE`, `ORIGIN` (brain-as-center).

## Architecture / Data flow
- One `.context/<session-slug>/` folder per session, holding 4 core `.syn` files (context/plan/findings/journal) + `grounding/` (dated evidence reports `YYYY-MM-DD-*`) + `recipes/` (dated reusable runbooks) + optional `REPORT.md` / `build-ledger.syn`.
- The big session adds `live-test/` and a `THE-DESIGN-AND-PLAN.syn` design-review doc.
- Findings cite grounding reports via `EVIDENCE_REF`; plan phases cite `recipes/*.syn` and name `grounding/*.syn` deliverables; journal entries reference findings block slugs (e.g. `findings.syn SYNAPTIQ_CONVERGENCE_15_MAYBE`).

## Drift / mess observed (factual, not prescriptive)
1. **Format fork:** the two research sessions use Shape A (`@finding`+SUMMARY/KIND/CONFIDENCE/CLASS), the implementation session uses Shape B (`@section`+THE_*). Neither matches the `_template` (which expects `@finding … DETAILS` and `@proposal`). The template's `@proposal`/`DETAILS`/`ACTION`/`VERIFICATION`/`GOAL` keys appear nowhere in the real sessions.
2. **findings STATUS vs plan STATUS disagree:** piri findings all `STATUS: open` while Plan_Index says all phases "complete"; per-phase sections still say `STATUS: in_progress`/`pending` (piri Phase_1..4 and deepwiki Phase_1..4 were never flipped from draft values).
3. **Header date staleness:** brain-as-center findings.syn/plan.syn say `@last_updated: 2026-08-17` but contain blocks dated 2026-08-19; content is 2 days newer than the header.
4. **Shape-B key proliferation:** ~30 distinct one-off `THE_*` keys in findings.syn (plus IMPLEMENT_* keys) — no stable field set.
5. **Block-size skew:** findings.syn spans 84 lines (piri) to 440 lines / 100 KB (brain-as-center, 63 sections).

## Start Here
Open `synaptiq/.context/piri-workspace-analysis/findings.syn` first — it is the smallest, cleanest, self-consistent example of the `@finding` block shape with all six canonical keys. Then compare against `brain-as-center/findings.syn` to see the divergent `@section`/`THE_*` shape. The `_template/` files define the intended (un-drifted) schema.

## Supervisor coordination
No blocking decisions needed; this was a read-only investigation with no ambiguity. Findings delivered directly.
