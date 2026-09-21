#!/usr/bin/awk -f
# cargo-test.awk: collapses passing cargo test outputs, isolates failures
# match: ^running [0-9]+ test
# command: ^cargo test( |$)
# stream: merged

BEGIN {
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  test_passed = 0
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

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    line = raw_lines[i]
    if (line ~ /^test [^ ]+ \.\.\. ok$/) {
      test_passed++
    } else if (line ~ /^test [^ ]+ \.\.\. FAILED$/) {
      flush_passed()
      emit(line)
    } else if (line ~ /^failures:$/ || line ~ /^test result: /) {
      flush_passed()
      emit(line)
    } else {
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
