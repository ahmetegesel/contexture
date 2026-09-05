# report grammar
blocks at column 0; fields indent 2; details indent 4;
typed blocks over prose; one statement per line; token-efficient.

@orientation
  STATUS: COMPLETE | PARTIAL | DRIFTED
  TASKS:
    1. <task-name>: DONE | DRIFTED | BLOCKED (exit: "<proven-condition>")
    2. <task-name>: DONE | DRIFTED | BLOCKED (exit: "<proven-condition>")
  LOAD_BEARING: [<claim-name>, ...]   # claims the dispatcher must re-verify

@claim <name>
  VERDICT: "one-line conclusion"
  EVIDENCE: <file:line or ref> ("exact verbatim quote or exit code")
  MARK: VERIFIED | INFERRED | ABSENT  # mandatory; ABSENT = case-insensitive,
                                      # all spellings, checked place it lives
  [DETAILS ::
    dense structural observations; one statement per line;
    code diffs, exact outputs, or ref comparisons; zero storytelling]

@risks
  UNVERIFIED: <what was skipped or unprovable; one line per condition>
  THIN: <areas relying on inference rather than hard tool verification>

# filled sample
@orientation
  STATUS: COMPLETE
  TASKS:
    1. git-topology: DONE (exit: "AGENTS.md:104 distinguishes parent from standalone")
    2. handoff-audit: DONE (exit: "README.md:484-491 names journal-dangling.awk")
  LOAD_BEARING: [base-git-topology, handoff-audit-placement]

@claim base-git-topology
  VERDICT: "Base @git updated to declare parent deny-by-default vs standalone private append."
  EVIDENCE: AGENTS.md:104 ("the gitignore denies by default for parent workspaces...")
  MARK: VERIFIED
  DETAILS ::
    standalone rules moved to separate sentence;
    matches ONBOARDING.md:30-39 topology guidance;
    check-ignore verified on private paths

@claim handoff-audit-placement
  VERDICT: "scripts/journal-dangling.awk added to README handoff verification."
  EVIDENCE: README.md:488 ("AND awk -f scripts/journal-dangling.awk exits 0")
  MARK: VERIFIED

@risks
  UNVERIFIED: none; all edits checked against active sessions
  THIN: none
