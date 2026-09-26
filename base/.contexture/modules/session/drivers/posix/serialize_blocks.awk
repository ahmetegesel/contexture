# serialize_blocks.awk: pure POSIX awk serializer for typed session blocks
# Formats entity properties into standard contexture markdown blocks

function indent_lines(text, prefix,    lines, n, i, r) {
  n = split(text, lines, "\n")
  r = ""
  for (i = 1; i <= n; i++) {
    r = r prefix lines[i]
    if (i < n) r = r "\n"
  }
  return r
}

BEGIN {
  # the free-text fields arrive in the environment (SB_<FIELD>), never through -v: -v
  # interprets backslash escapes and refuses a value holding a newline; the bounded
  # identifiers (block_type, slug, name, status, anchor) stay -v
  if ("SB_OBJECTIVE" in ENVIRON) objective = ENVIRON["SB_OBJECTIVE"]
  if ("SB_DESC" in ENVIRON) desc = ENVIRON["SB_DESC"]
  if ("SB_CRITERIA" in ENVIRON) criteria = ENVIRON["SB_CRITERIA"]
  if ("SB_DETAILS" in ENVIRON) details = ENVIRON["SB_DETAILS"]
  if ("SB_REFS" in ENVIRON) refs = ENVIRON["SB_REFS"]
  if ("SB_SUMMARY" in ENVIRON) summary = ENVIRON["SB_SUMMARY"]
  if ("SB_REF" in ENVIRON) ref = ENVIRON["SB_REF"]
  if ("SB_SUPERSEDES" in ENVIRON) supersedes = ENVIRON["SB_SUPERSEDES"]
  if (block_type == "task") {
    printf "@task %s\n", slug
    printf "  STATUS: %s\n", (status != "" ? status : "TODO")
    printf "  OBJECTIVE: \"%s\"\n", objective
    if (refs != "") {
      printf "  REFS: %s\n", refs
    }
    if (desc != "") {
      printf "  DESCRIPTION ::\n"
      print indent_lines(desc, "    ")
    }
    if (criteria != "") {
      printf "  ACCEPTANCE CRITERIA ::\n"
      print indent_lines(criteria, "    ")
    }
    if (details != "") {
      printf "  IMPLEMENTATION DETAILS ::\n"
      print indent_lines(details, "    ")
    }
    printf "\n"
  } else if (block_type == "finding") {
    printf "@finding %s\n", name
    if (supersedes != "") {
      printf "  SUPERSEDES: %s (superseded)\n", supersedes
    }
    printf "  SUMMARY ::\n"
    print indent_lines(summary, "    ")
    if (ref != "") {
      printf "  REF: \"%s\"\n", ref
    }
    printf "\n"
  } else if (block_type == "entry") {
    printf "@entry %s\n", slug
    if (anchor != "") {
      printf "  ANCHOR: %s\n", anchor
    }
    printf "  WHAT: \"%s\"\n", what
    if (group != "") {
      printf "  GROUP: %s\n", group
    }
    if (thread != "") {
      printf "  THREAD: %s\n", thread
    }
    if (closes != "") {
      printf "  CLOSES: %s (done: %s)\n", closes, (closes_reason != "" ? closes_reason : what)
    }
    if (supersedes != "") {
      printf "  SUPERSEDES: %s (superseded: %s)\n", supersedes, what
    }
    if (ref != "") {
      printf "  REF: \"%s\"\n", ref
    }
    if (knowledge == "true" || knowledge == "1") {
      printf "  KNOWLEDGE: true\n"
    }
    printf "\n"
  }
}
