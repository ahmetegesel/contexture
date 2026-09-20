#!/usr/bin/awk -f
# log.awk: generic log deduplication filter
# default

BEGIN {
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  log_rep_count = 0
  log_prev_raw = ""
  log_prev_norm = ""
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

function strip_timestamp(s,   t) {
  t = s
  sub(/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?(Z|[+-][0-9][0-9]:?[0-9][0-9])?[ \t]*/, "", t)
  sub(/^[0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?[ \t]*/, "", t)
  sub(/^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][^]]*\][ \t]*/, "", t)
  sub(/^\[[0-9][0-9]:[0-9][0-9]:[0-9][0-9][^]]*\][ \t]*/, "", t)
  return t
}

function flush_log_repeat() {
  if (log_rep_count == 0) return
  if (log_rep_count == 1) {
    emit(log_prev_raw)
  } else {
    emit(sprintf("[repeated %d times] %s", log_rep_count, log_prev_raw))
  }
  log_rep_count = 0
  log_prev_raw = ""
  log_prev_norm = ""
}

function process_log_line(line,   norm) {
  norm = strip_timestamp(line)
  if (norm != "" && norm == log_prev_norm) {
    log_rep_count++
  } else {
    flush_log_repeat()
    log_prev_raw = line
    log_prev_norm = norm
    log_rep_count = 1
  }
}

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    process_log_line(raw_lines[i])
  }
  flush_log_repeat()

  # Fail-safe
  if (out_count == 0 || out_bytes > raw_bytes) {
    for (i = 1; i <= raw_count; i++) {
      print raw_lines[i]
    }
    exit 0
  }

  for (i = 1; i <= out_count; i++) {
    print out_lines[i]
  }
}
