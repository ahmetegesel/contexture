#!/usr/bin/awk -f
# pytest.awk: collapses passing pytest outputs, isolates failures
# match: ^(=+ test session starts =+|collected [0-9]+ item)
# command: ^(python3? -m )?pytest( |$)

BEGIN {
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  test_passed = 0
  progress_lines = 0
}

{
  raw_count++
  raw_lines[raw_count] = $0
  raw_bytes += length($0) + 1
}

function emit(line) {
  out_count++
  out_lines[out_count] = line
  out_bytes += length(line) + 1
}

function flush_passed() {
  if (test_passed > 0) {
    emit(sprintf("[passed tests collapsed: %d]", test_passed))
    test_passed = 0
  }
}

function flush_progress() {
  if (progress_lines > 0) {
    emit(sprintf("[progress collapsed: %d lines; COMPACT_DISABLE=1 for the raw stream]", progress_lines))
    progress_lines = 0
  }
}

# The final counter line: decorated (equals banners) or bare
function is_summary(line) {
  if (line ~ /^=+ .* in [0-9.]+s ?=*$/) return 1
  if (line ~ /^[0-9]+ (passed|failed|error|errors|skipped|xfailed|xpassed|deselected)/ && line ~ / in [0-9.]+s$/) return 1
  return 0
}

# A quiet-mode progress line: only dots and outcome letters, optional percent
function is_progress(line) {
  return line ~ /^[.FEsxX]+( +\[[ 0-9]+%\])?$/
}

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    line = raw_lines[i]
    if (line ~ /^.* PASSED( +\[.*\])?$/) {
      test_passed++
    } else if (line ~ /^.* FAILED( +\[.*\])?$/ || line ~ /^.* (XPASS|XFAIL)( +\[.*\])?$/) {
      flush_progress()
      flush_passed()
      emit(line)
    } else if (line ~ /^===+ FAILURES ===+/ || line ~ /^===+ short test summary info ===+/ || is_summary(line)) {
      flush_progress()
      flush_passed()
      emit(line)
    } else if (is_progress(line)) {
      progress_lines++
    } else {
      flush_progress()
      emit(line)
    }
  }
  flush_passed()

  if (out_count == 0 || out_bytes > raw_bytes) {
    for (i = 1; i <= raw_count; i++) print raw_lines[i]
    exit 0
  }

  for (i = 1; i <= out_count; i++) print out_lines[i]
}
