#!/usr/bin/awk -f
# compact-filter.awk: zero-dependency stream compression filter
# Low-risk token reduction for unified diffs and repetitive logs.
#
# Usage:
#   cmd | awk -f compact-filter.awk [-v mode=diff|log|auto]
#                                   [-v max_context=1] [-v stats=0|1]
#
# Modes:
#   diff: git diff compression (strips metadata headers, collapses context runs)
#   log: log deduplication (collapses repeated consecutive log lines)
#   auto: sniffs first lines to select mode automatically (default)

BEGIN {
  if (mode == "") mode = "auto"
  if (max_context == "") max_context = 1
  if (failsafe == "") failsafe = 1
  if (stats == "") stats = 0

  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
}

{
  raw_count++
  raw_lines[raw_count] = $0
  raw_bytes += length($0) + 1
}

# --- Output Emission ---

function emit(line) {
  out_count++
  out_lines[out_count] = line
  out_bytes += length(line) + 1
}

# --- Helper Functions ---

function strip_timestamp(s,   t) {
  t = s
  # Strip ISO-8601 or date-time prefix
  sub(/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?(Z|[+-][0-9][0-9]:?[0-9][0-9])?[ \t]*/, "", t)
  # Strip time only prefix
  sub(/^[0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?[ \t]*/, "", t)
  # Strip bracketed date prefix
  sub(/^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][^]]*\][ \t]*/, "", t)
  # Strip bracketed time prefix
  sub(/^\[[0-9][0-9]:[0-9][0-9]:[0-9][0-9][^]]*\][ \t]*/, "", t)
  return t
}

# --- Diff Mode Handlers ---

function flush_diff_header() {
  if (pending_diff_file != "") {
    if (is_new_file) {
      emit("diff (new): " pending_diff_file)
    } else if (is_deleted_file) {
      emit("diff (deleted): " pending_diff_file)
    } else if (rename_from != "" && rename_to != "") {
      emit("diff (rename): " rename_from " -> " rename_to)
    } else {
      emit("diff: " pending_diff_file)
    }
    pending_diff_file = ""
    is_new_file = 0
    is_deleted_file = 0
    rename_from = ""
    rename_to = ""
  }
}

function flush_diff_context(   k, threshold, elided) {
  if (diff_ctx_len == 0) return
  threshold = (2 * max_context) + 1
  if (diff_ctx_len <= threshold) {
    for (k = 1; k <= diff_ctx_len; k++) {
      emit(diff_ctx_buf[k])
    }
  } else {
    for (k = 1; k <= max_context; k++) {
      emit(diff_ctx_buf[k])
    }
    elided = diff_ctx_len - (2 * max_context)
    emit(sprintf("  ... (%d context lines collapsed)", elided))
    for (k = diff_ctx_len - max_context + 1; k <= diff_ctx_len; k++) {
      emit(diff_ctx_buf[k])
    }
  }
  diff_ctx_len = 0
}

function process_diff_line(line,   fname) {
  if (line ~ /^diff --git /) {
    flush_diff_context()
    flush_diff_header()
    fname = line
    sub(/^diff --git a\//, "", fname)
    sub(/ b\/.*$/, "", fname)
    pending_diff_file = fname
    return
  }
  if (line ~ /^new file mode /) {
    is_new_file = 1
    return
  }
  if (line ~ /^deleted file mode /) {
    is_deleted_file = 1
    return
  }
  if (line ~ /^rename from /) {
    rename_from = substr(line, 13)
    return
  }
  if (line ~ /^rename to /) {
    rename_to = substr(line, 11)
    return
  }
  if (line ~ /^index [0-9a-fA-F]+\.\./) {
    return
  }
  if (line ~ /^--- (a\/|\/dev\/null)/) {
    return
  }
  if (line ~ /^\+\+\+ (b\/|\/dev\/null)/) {
    flush_diff_header()
    return
  }
  if (line ~ /^similarity index /) {
    return
  }
  if (line ~ /^@@ /) {
    flush_diff_header()
    flush_diff_context()
    emit(line)
    return
  }
  if (line ~ /^\+/) {
    flush_diff_header()
    flush_diff_context()
    emit(line)
    return
  }
  if (line ~ /^-/) {
    flush_diff_header()
    flush_diff_context()
    emit(line)
    return
  }
  if (line ~ /^ /) {
    flush_diff_header()
    diff_ctx_len++
    diff_ctx_buf[diff_ctx_len] = line
    return
  }
  if (line ~ /^\\ No newline at end of file/) {
    flush_diff_context()
    emit(line)
    return
  }
  # General lines: stat headers, commit messages, or diff summaries
  flush_diff_header()
  flush_diff_context()
  emit(line)
}

# --- Log Mode Handlers ---

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

# --- Mode Auto-Detection ---

function detect_stream_mode(   i, max_scan, line) {
  max_scan = raw_count < 50 ? raw_count : 50
  for (i = 1; i <= max_scan; i++) {
    line = raw_lines[i]
    if (line ~ /^diff --git / || line ~ /^index [0-9a-fA-F]+\.\./ || line ~ /^@@ / || line ~ /^--- a\//) {
      return "diff"
    }
  }
  return "log"
}

# --- Main Driver ---

END {
  if (raw_count == 0) {
    exit 0
  }

  if (mode == "" || mode == "auto") {
    active_mode = detect_stream_mode()
  } else {
    active_mode = mode
  }

  # Initialize mode state
  pending_diff_file = ""
  is_new_file = 0
  is_deleted_file = 0
  rename_from = ""
  rename_to = ""
  diff_ctx_len = 0

  log_rep_count = 0
  log_prev_raw = ""
  log_prev_norm = ""

  # Process buffered records
  for (i = 1; i <= raw_count; i++) {
    cur_line = raw_lines[i]
    if (active_mode == "diff") {
      process_diff_line(cur_line)
    } else {
      process_log_line(cur_line)
    }
  }

  # Flush residual state per mode
  if (active_mode == "diff") {
    flush_diff_context()
    flush_diff_header()
  } else {
    flush_log_repeat()
  }

  # Fail-safe verification: never produce empty output from non-empty input,
  # and never produce output larger than raw input.
  if (failsafe) {
    if (out_count == 0 || out_bytes > raw_bytes) {
      for (i = 1; i <= raw_count; i++) {
        print raw_lines[i]
      }
      exit 0
    }
  }

  # Emit filtered lines
  for (i = 1; i <= out_count; i++) {
    print out_lines[i]
  }

  if (stats) {
    pct = raw_bytes > 0 ? (100.0 * (raw_bytes - out_bytes) / raw_bytes) : 0
    printf("[compact-filter: %d -> %d lines, %d -> %d bytes (%.1f%% reduction, mode=%s)]\n", raw_count, out_count, raw_bytes, out_bytes, pct, active_mode) > "/dev/stderr"
  }
}
