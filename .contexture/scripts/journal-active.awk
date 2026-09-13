#!/usr/bin/awk -f
# journal-active.awk: Stream unclosed journal entries with complete bodies
# Usage:
#   awk -f .contexture/scripts/journal-active.awk <session-slug-or-journal-path>
#   awk -f .contexture/scripts/journal-active.awk -v refs=1 <session-slug-or-journal-path>
#   awk -f .contexture/scripts/journal-active.awk -v refs_only=1 <session-slug-or-journal-path>

function resolve_journal_and_state(input_arg, res,   arg, n, parts, i, dir) {
  arg = input_arg
  sub(/^\.\//, "", arg)
  sub(/\/+$/, "", arg)

  if (arg ~ /\.md$/) {
    res["journal"] = arg
    n = split(arg, parts, "/")
    dir = ""
    for (i = 1; i < n; i++) dir = dir parts[i] "/"
    res["dir"] = dir
    res["state"] = dir "state.md"
  } else {
    if (arg ~ /^\.contexture\/sessions\//) {
      dir = arg "/"
    } else {
      dir = ".contexture/sessions/" arg "/"
    }
    res["dir"] = dir
    res["journal"] = dir "journal.md"
    res["state"] = dir "state.md"
  }
}

function parse_ref_sessions(state_file, refs_out,   line, raw, parts, n, i, count) {
  count = 0
  while ((getline line < state_file) > 0) {
    if (line ~ /^[ \t]*ref_sessions:[ \t]*/) {
      raw = line
      sub(/^[ \t]*ref_sessions:[ \t]*\[/, "", raw)
      sub(/\].*$/, "", raw)
      n = split(raw, parts, /[ \t]*,[ \t]*/)
      for (i = 1; i <= n; i++) {
        gsub(/^[ \t]+|[ \t]+$/, "", parts[i])
        if (parts[i] != "") {
          count++
          refs_out[count] = parts[i]
        }
      }
    }
  }
  close(state_file)
  return count
}

function process_journal(journal_path, is_ref, ref_name,   test_line, test_ret, line, words, n, i, closed, printing, slug) {
  test_line = ""
  test_ret = (getline test_line < journal_path)
  if (test_ret < 0) {
    if (is_ref) {
      print "WARNING: reference journal not found: " journal_path > "/dev/stderr"
    } else {
      print "ERROR: journal file not found: " journal_path > "/dev/stderr"
      exit 1
    }
    return
  }
  close(journal_path)

  # Pass 1: collect closed and superseded slugs
  while ((getline line < journal_path) > 0) {
    if (line ~ /^[ \t]*(CLOSES|SUPERSEDES):/) {
      sub(/^[ \t]*(CLOSES|SUPERSEDES):[ \t]*/, "", line)
      sub(/[ \t]+-[ \t]+.*$/, "", line)
      sub(/[ \t]+\(.*$/, "", line)
      n = split(line, words, /[ \t]+/)
      for (i = 1; i <= n; i++) {
        if (words[i] ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) {
          closed[words[i]] = 1
        }
      }
    }
  }
  close(journal_path)

  # Pass 2: stream unclosed entry bodies
  if (is_ref) {
    print ""
    print "# === REF SESSION: " ref_name " ==="
    print "# NOTICE: Read-only reference context. Do not edit, resolve, or append entries here."
    print "# All new tasks, active events, and state changes belong exclusively to the active session."
    print ""
  }
  printing = 0
  while ((getline line < journal_path) > 0) {
    if (line ~ /^@entry /) {
      n = split(line, words, /[ \t]+/)
      slug = words[2]
      printing = !(slug in closed)
    } else if (line ~ /^@anchor /) {
      printing = 0
    }
    if (printing) {
      print line
    }
  }
  close(journal_path)
}

BEGIN {
  if (ARGC < 2) {
    print "Usage: journal-active.awk [-v refs=1] [-v refs_only=1] <session-slug-or-journal-path>" > "/dev/stderr"
    exit 1
  }

  resolve_journal_and_state(ARGV[1], main_info)

  num_refs = 0
  if (refs == 1 || refs_only == 1) {
    num_refs = parse_ref_sessions(main_info["state"], ref_list)
  }

  if (refs_only != 1) {
    process_journal(main_info["journal"], 0, "")
  }

  if (refs == 1 || refs_only == 1) {
    for (r = 1; r <= num_refs; r++) {
      ref_session = ref_list[r]
      resolve_journal_and_state(ref_session, ref_info)
      process_journal(ref_info["journal"], 1, ref_session)
    }
  }

  exit 0
}
