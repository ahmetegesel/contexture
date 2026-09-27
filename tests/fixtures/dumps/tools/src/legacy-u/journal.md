# journal grammar

blocks at column 0; fields indent 2.

@anchor A1 ("session initialized", attention: [])

@entry 2026-09-20-legacy-one
  ANCHOR: A1
  WHAT: "A canonical entry with every field"
  GROUP: legacy
  RHYTHM: default 1 DISCUSS
  THREAD: none
  REF: "knowledge#LEGACY_CANON"
  KNOWLEDGE: true

@entry 2026-09-20-legacy-status
  STATUS: DONE
  WHAT: "An entry with a legacy STATUS field"
  THREAD: none

@entry 2026-09-20-double-what
  WHAT: "the first WHAT"
  WHAT: "the second WHAT wins"
  THREAD: none
# a column-0 comment inside the span

@entry 2026-09-20-legacy-two
  ANCHOR: A1
  WHAT: "Unquoted REF and a closer without a verdict word"
  THREAD: none
  REF: knowledge#SUMMARY_FIRST
  CLOSES: 2026-09-20-legacy-status (no verdict word here)

@anchor A2 ("continues A1", attention: "the posix stamp quoted form")
@entry 2026-09-21-legacy-three
  ANCHOR: A2
  WHAT: "Doubled verdict groups and a spaced hyphen reason"
  THREAD: the human
  CLOSES: 2026-09-20-double-what (done: first) (done: second)
  SUPERSEDES: 2026-09-20-legacy-one - replaced in a legacy spelling

@anchor A3 ("continues A2", attention: canonical third anchor)

@entry 2026-09-21-multi-line
  ANCHOR: A3
  WHAT: "a WHAT spanning
  two lines"
  THREAD: none
  NOTE: an unknown field
  CLOSES: 2026-09-20-legacy-two (done: canonical closer)

@entry 2026-09-10-no-anchor
  WHAT: "backlog/four-space-blank: DONE (landed before the legacy walk)"
