#!/usr/bin/env bash
set -u

if (( $# == 0 )); then
  echo 'Usage: check-output.sh COMMAND [ARG ...]' >&2
  exit 64
fi

log=$(mktemp "${TMPDIR:-/tmp}/loop-check.XXXXXXXX") || exit 1
"$@" >"$log" 2>&1
status=$?
printf '%s exit=%d log=%s\n' "${1##*/}" "$status" "$log"
if (( status != 0 )); then
  # 最初の失敗箇所とその前後を抜き出す。形式が未知なら末尾を使う。
  LC_ALL=C awk '
    {
      line = substr($0, 1, 480)
      if (!found && tolower($0) ~ /(^|[^[:alnum:]_])(fail(ed|ure|ures)?|errors?|exception|fatal|panic)([^[:alnum:]_]|$)|✗|×/) {
        found = 1
        if (NR > 2) print before
        if (NR > 1) print previous
        remaining = 9
      }
      if (found && remaining-- > 0) print line
      if (found && remaining <= 0) exit
      before = previous
      previous = line
      tail[NR % 10] = line
    }
    END {
      if (!found)
        for (i = (NR > 10 ? NR - 9 : 1); i <= NR; i++) print tail[i % 10]
    }
  ' "$log"
fi
exit "$status"
