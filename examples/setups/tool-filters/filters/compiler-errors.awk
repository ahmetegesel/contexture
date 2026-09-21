#!/usr/bin/awk -f
# compiler-errors.awk: caps compiler diagnostic cascades at 20 errors
# match: ([(][0-9]+,[0-9]+[)]: (error|warning) TS[0-9]+:|:[0-9]+:[0-9]+ - (error|warning) TS[0-9]+:|^(error|warning) TS[0-9]+:|:[0-9]+:[0-9]+: (fatal )?error:|^error)
# command: ^(tsc|gcc|clang)( |$)
# stream: merged

BEGIN {
  if (max_errors == "") max_errors = 20
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  err_count = 0
  err_suppressed = 0
  err_state = "NORMAL"
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

function is_error_start(line) {
  if (line ~ /^error(\[[A-Za-z0-9_-]+\])?:/ && line !~ /^error: could not compile/) return 1
  if (line ~ /:[0-9]+:[0-9]+: (fatal )?error:/) return 1
  if (line ~ /\([0-9]+,[0-9]+\): (error|warning) TS[0-9]+:/) return 1
  if (line ~ /:[0-9]+:[0-9]+ - (error|warning) TS[0-9]+:/) return 1
  if (line ~ /^(error|warning) TS[0-9]+:/) return 1
  return 0
}

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    line = raw_lines[i]
    if (is_error_start(line)) {
      err_count++
      if (err_count <= max_errors) {
        err_state = "ALLOWED"
        emit(line)
      } else {
        err_state = "SUPPRESSED"
        err_suppressed++
      }
      continue
    }

    if (err_state == "ALLOWED") {
      emit(line)
      continue
    }

    if (err_state == "SUPPRESSED") {
      if (line ~ /^[ \t]/ || line ~ /^[0-9]+[ \t]*\|/ || line ~ /^[ \t]*\|/ || line ~ /^[ \t]*-->/ || line ~ /^$/) {
        continue
      }
      err_state = "NORMAL"
      emit(line)
      continue
    }

    emit(line)
  }

  if (err_suppressed > 0) {
    emit(sprintf("[... elided %d additional errors; capped at %d]", err_suppressed, max_errors))
  }

  # False-green guard: a non-zero exit with no parsed diagnostic start means
  # a failing command produced nothing this filter understands; surface the
  # notice alone so the failure never reads as a clean run
  if (COMPACT_EXIT + 0 != 0 && err_count == 0) {
    print "[compact: compiler-errors.awk: exit " COMPACT_EXIT " with no parsed diagnostics; COMPACT_DISABLE=1 for the raw stream]"
    exit 0
  }

  if (out_count == 0 || out_bytes > raw_bytes) {
    for (i = 1; i <= raw_count; i++) print raw_lines[i]
    exit 0
  }

  for (i = 1; i <= out_count; i++) print out_lines[i]
}
