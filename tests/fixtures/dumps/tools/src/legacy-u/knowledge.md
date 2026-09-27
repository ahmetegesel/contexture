# knowledge grammar

@finding LEGACY_CANON
  REF: "journal#2026-09-20-legacy-one"
  SUMMARY ::
    A canonical finding.

@finding legacy-lowercase-name
  SUMMARY ::
    A canonical finding whose legacy name is lowercase with hyphens.

@finding SUMMARY_FIRST
  SUMMARY ::
    The posix serializer wrote SUMMARY before REF.
  REF: "journal#2026-09-20-legacy-two"

@finding LEGACY_SUCCESSOR
  SUPERSEDES: LEGACY_CANON (replaced by the successor)
  REF: "journal#2026-09-21-legacy-three"
  SUMMARY ::
    A canonical successor.
