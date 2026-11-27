# store-key.awk: the storage core's one key rule, the awk functions the resolver's dispatch
# gate and every bundled driver read (no program of its own: a caller prepends this text to
# its program and runs awk in the C locale, so every length is in bytes). A key is one or
# more segments joined by a slash; each segment opens with a letter or a digit, holds only
# letters, digits, dot, underscore, and dash, and is at most 200 bytes; the whole key is at
# most 512 bytes; in a namespace whose key pattern ends in a <name...> placeholder (multi),
# no segment but the last ends with the namespace's suffix, so no key's folder is another
# key's file. The fold set holds the live keys' leading runs of segments folded under ASCII
# case, so a put whose leading run folds onto a stored run of another spelling is found in
# one pass over the live list.

function kr_seg(s) { return length(s) <= 200 && s ~ /^[A-Za-z0-9][A-Za-z0-9._-]*$/ }

function kr_ends(s, sfx) { return sfx != "" && length(s) >= length(sfx) && substr(s, length(s) - length(sfx) + 1) == sfx }

function kr_multi(pat,   n, p) { n = split(pat, p, /\//); return n >= 1 && p[n] ~ /^<[A-Za-z][A-Za-z0-9_]*\.\.\.>$/ }

function kr_key(s, sfx, multi,   n, p, i) {
  if (s == "" || length(s) > 512) return 0
  n = split(s, p, /\//)
  for (i = 1; i <= n; i++) {
    if (!kr_seg(p[i])) return 0
    if (multi && i < n && kr_ends(p[i], sfx)) return 0
  }
  return 1
}

function kr_list_prefix(s, sfx, multi,   n, p, i) {
  if (s == "" || length(s) > 512) return 0
  n = split(s, p, /\//)
  for (i = 1; i < n; i++) if (!kr_seg(p[i]) || (multi && kr_ends(p[i], sfx))) return 0
  return p[n] == "" || kr_seg(p[n])
}

function kr_whole_prefix(s, sfx, multi,   n, p, i) {
  if (length(s) < 2 || length(s) > 512 || substr(s, length(s), 1) != "/") return 0
  n = split(substr(s, 1, length(s) - 1), p, /\//)
  for (i = 1; i <= n; i++) if (!kr_seg(p[i]) || (multi && kr_ends(p[i], sfx))) return 0
  return 1
}

function kr_esc(s,   n, p, i, o) {
  n = split(s, p, /\\/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]; s = o
  n = split(s, p, /\n/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "n" p[i]; s = o
  n = split(s, p, /\t/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "t" p[i]; s = o
  n = split(s, p, /\r/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "r" p[i]
  return o
}

function kr_fold_add(k,   n, p, i, r, f) {
  if (k in KR_LIVE) return
  KR_LIVE[k] = 1
  n = split(k, p, /\//)
  r = ""
  for (i = 1; i <= n; i++) {
    r = (i == 1 ? p[1] : r "/" p[i])
    f = tolower(r)
    if (!(f in KR_RUN)) KR_RUN[f] = r
    KR_CNT[f]++
  }
}

function kr_fold_del(k,   n, p, i, r, f) {
  if (!(k in KR_LIVE)) return 0
  delete KR_LIVE[k]
  n = split(k, p, /\//)
  r = ""
  for (i = 1; i <= n; i++) {
    r = (i == 1 ? p[1] : r "/" p[i])
    f = tolower(r)
    if (--KR_CNT[f] <= 0) { delete KR_CNT[f]; delete KR_RUN[f] }
  }
  return 1
}

function kr_twin(k,   n, p, i, r, f) {
  n = split(k, p, /\//)
  r = ""
  for (i = 1; i <= n; i++) {
    r = (i == 1 ? p[1] : r "/" p[i])
    f = tolower(r)
    if ((f in KR_RUN) && KR_RUN[f] != r) { KR_AT = r; KR_TWIN = KR_RUN[f]; KR_WHOLE = (i == n); return 1 }
  }
  return 0
}

# kr_pass: the twin pass over two files, the live keys (one per line) then the actions (n,
# op, key, tab separated): each put checked against the fold set and added in action order,
# each delete found live and removed; the first failure printed as twin, n, key, the stored
# run, the run of the key, and whole (1 when the run is the whole key), or missing, n, key
function kr_pass_line(line,   a) {
  if (FILENAME == ARGV[1]) { if (line != "") kr_fold_add(line); return 0 }
  split(line, a, /\t/)
  if (a[2] == "put") {
    if (kr_twin(a[3])) { printf "twin\t%s\t%s\t%s\t%s\t%s\n", a[1], a[3], KR_TWIN, KR_AT, KR_WHOLE; return 1 }
    kr_fold_add(a[3])
  } else if (a[2] == "delete") {
    if (!kr_fold_del(a[3])) { printf "missing\t%s\t%s\n", a[1], a[3]; return 1 }
  }
  return 0
}
