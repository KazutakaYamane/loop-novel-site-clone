#!/usr/bin/env bash
# 分割の機械的な検証(AGENTS.md「Planning」)。本体は issues.py validate。
set -euo pipefail
LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config
source "$LOOP_DIR/config"
export MAX_AC_PER_ISSUE
exec python3 -I "$LOOP_DIR/issues.py" validate
