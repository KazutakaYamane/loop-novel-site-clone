# 0006 マージ時の metrics の記録

- 状態: 採用
- 日付: 2026-11-26

## 背景

人間がレビューする版と比べるために、PR ごとの時間、トークン(ターン数)、費用、試行回数、CI の失敗回数を残す。まとめ役(`scripts/loop/run.sh`)は、マージの直前に `<!-- loop-metrics -->` で始まるコメントに、各実行(実装、レビューなど)の metrics を JSON Lines で書く。`metrics/` は CI だけが書く。

## 決定

- `.github/workflows/metrics.yml` が、マージされた PR(`pull_request` の `closed` で `merged`)ごとに 1 回走り、`.github/scripts/metrics.py` が作った 1 行の JSON を、`metrics` ブランチの `metrics/metrics.jsonl` に追記して push する。ブランチが無ければ作る。同時に走らないよう、concurrency で 1 本にする。
- 1 行の中身
  - `pr`、`issue`(本文の `Closes #`)、`title`、`branch`、`created_at`、`merged_at`、`recorded_at`
  - `attempts`: PR に対して `CI` ワークフローが走った head の SHA の数(1 回の push が 1 回の実行を起こすので、push の回数になる)
  - `ci_runs`: `CI` ワークフローの実行回数。`ci_failures`: そのうち失敗(failure、timed_out、startup_failure)の数。取り消された実行は失敗に数えない
  - `runs`: metrics のコメントの各行そのまま。`totals`: その合計(`api_equivalent_cost_usd`、`duration_ms`、`num_turns`、`resumes`)
  - `metrics_comment_found`: コメントが見つかったか
- 実行の記録は、PR の head のブランチ名で GitHub Actions から引く。

## 結果

- 閉じただけの PR(カナリアなど)は記録しない。
- 同じ head の SHA で CI をやり直した場合は、`ci_runs` だけが増える。
