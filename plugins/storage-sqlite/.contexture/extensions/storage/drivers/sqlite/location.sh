# location.sh: the sqlite driver's one location reader, sourced by the driver and by its
# lifecycle hooks (prepare, finish, cleanup), so all of them read one database place. Needs
# MODULE_DIR (the driver part's folder) and the working folder inside the workspace. Sets
# ROOT, the nearest folder above the working folder holding a drawer, and DB_PATH: the
# CTX_STORAGE_SQLITE_PATH override when set (the package installer never passes it to a
# hook), else the configuration's storage.database (a relative value read from the workspace
# root), else the driver's default inside the drawer.

find_workspace_root() {
  curr="$PWD"
  while [ "$curr" != "/" ]; do
    if [ -d "$curr/.contexture" ]; then
      printf '%s\n' "$curr"
      return 0
    fi
    curr=$(dirname "$curr")
  done
  printf '%s\n' "$PWD"
}

ROOT=$(find_workspace_root)

read_conf_db() {
  rcd_root=$1
  rcd_lib=""
  for rcd_c in \
    "$MODULE_DIR/../../../../config-lib" \
    "$rcd_root/.contexture/config-lib" \
    "$rcd_root/base/.contexture/config-lib"; do
    if [ -f "$rcd_c" ]; then
      rcd_lib=$rcd_c
      break
    fi
  done
  if [ -n "$rcd_lib" ]; then
    . "$rcd_lib"
    for rcd_cf in "$rcd_root/.contexture/config" "$rcd_root/.contexture/storage.conf"; do
      [ -f "$rcd_cf" ] || continue
      for rcd_ck in storage.database session.storage.database; do
        rcd_val=$(cfg_get_file "$rcd_cf" "$rcd_ck" 2>/dev/null) && [ -n "$rcd_val" ] && {
          printf '%s\n' "$rcd_val"
          return 0
        }
      done
    done
    return 1
  fi

  # Safe inline fallback when config-lib is absent
  for rcd_cf in "$rcd_root/.contexture/config" "$rcd_root/.contexture/storage.conf"; do
    [ -f "$rcd_cf" ] || continue
    for rcd_ck in storage.database session.storage.database; do
      rcd_val=$(LC_ALL=C awk -v target="$rcd_ck" '
        {
          line = $0
          sub(/\r$/, "", line)
          if (line ~ /^[ \t]*$/ || line ~ /^[ \t]*#/) next
          if (!match(line, /[:=]/)) next
          k = substr(line, 1, RSTART - 1)
          gsub(/^[ \t]+|[ \t]+$/, "", k)
          if (k != target) next
          v = substr(line, RSTART + 1)
          sub(/^[ \t]+/, "", v)
          if (substr(v, 1, 1) == "\"" || substr(v, 1, 1) == "'"'"'") {
            q = substr(v, 1, 1)
            v = substr(v, 2)
            p = index(v, q)
            if (p > 0) v = substr(v, 1, p - 1)
          } else {
            p = index(v, "#")
            if (p > 0) v = substr(v, 1, p - 1)
            sub(/[ \t]+$/, "", v)
          }
          if (v != "") { print v; exit 0 }
        }' "$rcd_cf" 2>/dev/null)
      if [ -n "$rcd_val" ]; then
        printf '%s\n' "$rcd_val"
        return 0
      fi
    done
  done
  return 1
}

if [ -n "${CTX_STORAGE_SQLITE_PATH:-}" ]; then
  DB_PATH="$CTX_STORAGE_SQLITE_PATH"
elif sqlite_db_val=$(read_conf_db "$ROOT") && [ -n "$sqlite_db_val" ]; then
  case "$sqlite_db_val" in
    /*) DB_PATH="$sqlite_db_val" ;;
    *)  DB_PATH="$ROOT/$sqlite_db_val" ;;
  esac
else
  DB_PATH="$ROOT/.contexture/sessions.db"
fi
