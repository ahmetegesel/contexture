#!/usr/bin/awk -f
# diff.awk: unified diff context reduction filter
# match: ^(diff --git |index [0-9a-fA-F]+\.\.|@@ -)
# command: ^git (diff|show)( |$)
# format-only: header metadata and layout; diff content preserved

BEGIN {
  if (max_context == "") max_context = 1
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  diff_ctx_len = 0
  pending_diff_file = ""
  is_new_file = 0
  is_deleted_file = 0
  rename_from = ""
  rename_to = ""
  seen_hunk = 0
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
  if (!seen_hunk) {
    for (k = 1; k <= diff_ctx_len; k++) {
      emit(diff_ctx_buf[k])
    }
    diff_ctx_len = 0
    return
  }
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
    emit(sprintf("  ... (%d context lines collapsed; COMPACT_DISABLE=1 for the raw stream)", elided))
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
  if (line ~ /^index [0-9a-fA-F]+\.\./) return
  if (line ~ /^--- (a\/|\/dev\/null)/) return
  if (line ~ /^\+\+\+ (b\/|\/dev\/null)/) {
    flush_diff_header()
    return
  }
  if (line ~ /^similarity index /) return
  if (line ~ /^@@ /) {
    if (line ~ /^@@ -/) seen_hunk = 1
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
  flush_diff_header()
  flush_diff_context()
  emit(line)
}

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    process_diff_line(raw_lines[i])
  }

  # A stream with no hunk header is not a diff: pass it verbatim
  if (!seen_hunk) {
    for (i = 1; i <= raw_count; i++) {
      print raw_lines[i]
    }
    exit 0
  }

  flush_diff_context()
  flush_diff_header()

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
