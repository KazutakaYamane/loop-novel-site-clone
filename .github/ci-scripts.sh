#!/usr/bin/env bash
# CI のスクリプト(.github/scripts/)を $RUNNER_TEMP/ci に置く。
# PR がスクリプトを書き換えて検査をすり抜けないよう、base ブランチにあるものを使う。
# base にまだ無いとき(bootstrap の PR)だけ、PR のものを使う。
set -euo pipefail

dest="${RUNNER_TEMP:?}/ci"
ref="origin/${BASE_REF:?}"
rm -rf "$dest"
mkdir -p "$dest"
if git cat-file -e "$ref:.github/scripts/guard.py" 2>/dev/null; then
  git archive "$ref" .github/scripts | tar -x -C "$dest" --strip-components=2
  echo "ci-scripts: using .github/scripts from $ref"
else
  cp -R .github/scripts/. "$dest/"
  echo "ci-scripts: $ref has no .github/scripts; using the PR's own copy"
fi
