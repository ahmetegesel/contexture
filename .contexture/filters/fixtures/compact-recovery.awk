#!/usr/bin/awk -f
# compact-recovery.awk: harness probe; truncates with no notice so the
# recovery fallback to raw is provable
{
  raw_count++
  raw_lines[raw_count] = $0
}
END {
  if (raw_count == 0) exit 0
  print raw_lines[1]
}
