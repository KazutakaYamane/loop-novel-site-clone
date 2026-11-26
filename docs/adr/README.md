# 設計判断の記録(ADR)

1 つの判断を 1 つのファイル(`NNNN-<slug>.md`)に、決めた順に書く。既存の ADR は書き換えない。判断を変えるときは、置き換える ADR の案を issue に書いて人間に上げる(AGENTS.md)。

新しい ADR を足したら、下の表の末尾に 1 行を追記する。この README は既存の行を変えられない(CI の guard が行の削除を止める)。

| 番号 | 題名 | 状態 |
|---|---|---|
| [0001](0001-worktree-isolation.md) | worktree ごとに Compose プロジェクトとポートを分ける | 採用 |
| [0002](0002-backend-mysql-and-test-database.md) | バックエンドは MySQL を使い、テストは専用の DB で動かす | 採用 |
| [0003](0003-test-and-check-tooling.md) | テストと静的解析の道具と、その設定 | 採用 |
| [0004](0004-ci-jobs-and-guard.md) | CI のジョブの構成と guard の判定方法 | 採用 |
| [0005](0005-acceptance-criteria-tags.md) | 受け入れ条件の ID をテストに付ける方法 | 採用 |
| [0006](0006-merge-metrics.md) | マージ時の metrics の記録 | 採用 |
| [0007](0007-deterministic-visual-and-dev-server.md) | 見た目の比較を安定させるための開発サーバーとフォントの扱い | 採用 |
| [0008](0008-guard-runs-from-the-base-branch.md) | guard を base ブランチのワークフローの定義で動かす | 0009 で置き換え |
| [0009](0009-guard-in-three-workflows.md) | guard を `pull_request` の 3 つのワークフローに置く | 採用 |
| [0010](0010-composer-github-token-in-ci.md) | CI の composer install にジョブのトークンを渡す | 採用 |
| [0011](0011-composer-cache-from-base-branch.md) | CI の composer のキャッシュを base ブランチで作り、PR が読む | 採用 |
| [0012](0012-layout-styling-and-site-name.md) | 画面の組み方(CSS Modules)とクローンのサイト名 | 採用 |
| [0013](0013-visual-baselines-per-element.md) | 見た目の基準画像は確定した要素だけを撮る | 採用 |
| [0014](0014-structured-json-logs.md) | アプリのログは 1 行 1 件の JSON で標準出力・標準エラーに出す | 採用 |
