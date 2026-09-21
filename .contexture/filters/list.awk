#!/usr/bin/awk -f
# list.awk: directory listing compaction filter
# match: ^(total [0-9]+|[-dcbpls][-rwxStTsST]{9}[@+]?[ \t]+[0-9]+)

BEGIN {
  if (max_entries == "") max_entries = 40
  raw_count = 0
  raw_bytes = 0
  out_count = 0
  out_bytes = 0
  section_count = 0
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

function format_size(bytes,   num) {
  if (bytes !~ /^[0-9]+$/) return bytes
  num = bytes + 0
  if (num < 1024) return sprintf("%dB", num)
  if (num < 1048576) return sprintf("%.1fK", num / 1024)
  if (num < 1073741824) return sprintf("%.1fM", num / 1048576)
  return sprintf("%.1fG", num / 1073741824)
}

function flush_section(   k, limit, elided, elided_files, elided_dirs, mode) {
  if (section_count == 0) return

  if (section_header != "") {
    emit(section_header)
    section_header = ""
  }

  limit = max_entries
  if (section_count <= limit) {
    for (k = 1; k <= section_count; k++) {
      emit(sec_lines[k])
    }
  } else {
    limit = max_entries - 5
    for (k = 1; k <= limit; k++) {
      emit(sec_lines[k])
    }
    elided = section_count - limit
    elided_files = 0
    elided_dirs = 0
    for (k = limit + 1; k <= section_count; k++) {
      mode = sec_modes[k]
      if (mode == "d") elided_dirs++
      else elided_files++
    }
    emit(sprintf("  ... (%d additional entries collapsed: %d files, %d dirs)", elided, elided_files, elided_dirs))
  }

  section_count = 0
}

function process_line(line,   first, mode, size_str, fname, f, formatted, type_tag) {
  # Blank lines
  if (line ~ /^[ \t]*$/) return

  # Directory section headers (e.g. "path/to/dir:")
  if (line ~ /^.+:$/) {
    flush_section()
    section_header = line
    return
  }

  # Total line
  if (line ~ /^total [0-9]+/) {
    return
  }

  # File or directory entry line
  if (line ~ /^[-dcbpls][-rwxStTsST]{9}/) {
    split(line, fields)
    mode = substr(fields[1], 1, 1)

    # In standard POSIX ls -l: mode, nlink, user, group, size, month, day, time/year, name
    if (length(fields) < 9) return

    fname = fields[9]
    for (f = 10; f <= length(fields); f++) {
      fname = fname " " fields[f]
    }

    # Skip . and .. entries
    if (fname == "." || fname == "..") return

    size_str = format_size(fields[5])

    if (mode == "d") {
      type_tag = "[dir] "
      if (fname !~ /\/$/) fname = fname "/"
      formatted = sprintf("%s %-7s %s", type_tag, size_str, fname)
    } else if (mode == "l") {
      type_tag = "[link]"
      formatted = sprintf("%s %-7s %s", type_tag, size_str, fname)
    } else if (mode == "-") {
      type_tag = "[file]"
      formatted = sprintf("%s %-7s %s", type_tag, size_str, fname)
    } else {
      type_tag = "[dev] "
      formatted = sprintf("%s %-7s %s", type_tag, size_str, fname)
    }

    section_count++
    sec_lines[section_count] = formatted
    sec_modes[section_count] = mode
    return
  }

  # Non-matching lines in listing (e.g. headers or error lines)
  flush_section()
  emit(line)
}

END {
  if (raw_count == 0) exit 0

  for (i = 1; i <= raw_count; i++) {
    process_line(raw_lines[i])
  }
  flush_section()

  # Fail-safe: if empty or bloated, emit raw
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
