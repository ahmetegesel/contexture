#!/usr/bin/awk -f
# vitest.awk: collapses passing vitest / jest test runs, isolates failing suites and cases
# match: ^[ \t]*(✓|❯|×|↓|PASS |FAIL |Test Files[ \t]|Test Suites:|Tests:[ \t])
# command: ^(npx )?(vitest|jest)( |$)

BEGIN {
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  test_passed = 0
  fail_detail = 0
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

# File-level markers carry the test-count parenthetical; per-test check
# lines inside failure details do not, so they survive verbatim
function is_pass_file(line) {
  return line ~ /^[ \t]*✓ / && line ~ /\([0-9]+ tests?/
}

function is_fail_file(line) {
  return line ~ /^[ \t]*❯ / && line ~ /\([0-9]+ tests? \|/
}

function is_fail_case(line) {
  return line ~ /^[ \t]*× /
}

function is_skip_file(line) {
  return line ~ /^[ \t]*↓ /
}

function is_summary(line) {
  return line ~ /^[ \t]*Test Files[ \t]/ || line ~ /^[ \t]*Tests[ \t]/ || line ~ /^Tests:/ || line ~ /^Test Suites:/
}

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    line = raw_lines[i]
    if (is_fail_file(line)) {
      flush_passed()
      emit(line)
      fail_detail = 1
    } else if (is_skip_file(line)) {
      flush_passed()
      emit(line)
      fail_detail = 0
    } else if (fail_detail) {
      if (is_pass_file(line) || line ~ /^PASS /) {
        fail_detail = 0
        test_passed++
      } else if (line ~ /^FAIL /) {
        emit(line)
      } else if (is_summary(line)) {
        fail_detail = 0
        flush_passed()
        emit(line)
      } else {
        emit(line)
      }
    } else if (is_pass_file(line) || line ~ /^PASS /) {
      test_passed++
    } else if (is_fail_case(line) || line ~ /^FAIL /) {
      flush_passed()
      emit(line)
      fail_detail = 1
    } else if (is_summary(line)) {
      flush_passed()
      emit(line)
    } else if (line ~ /^[ \t]*✓ /) {
      test_passed++
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
