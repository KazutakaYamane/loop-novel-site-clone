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
| [0013](0013-visual-baselines-per-element.md) | 見た目の基準画像は確定した要素だけを撮る | 0016 で置き換え |
| [0014](0014-structured-json-logs.md) | アプリのログは 1 行 1 件の JSON で標準出力・標準エラーに出す | 採用 |
| [0015](0015-session-login-and-csrf.md) | ログイン状態は Laravel のセッションで持ち、ブラウザは Next.js と同じオリジンから API を呼ぶ | 採用 |
| [0016](0016-visual-baselines-named-by-the-issue.md) | 見た目の基準画像は、issue が名指ししたものだけ撮り直してよい | 採用 |
| [0017](0017-client-ip-and-demo-login-rate-limit.md) | 利用者の IP の決め方と、デモログインの回数の制限、E2E がその制限と両立する方法 | 採用 |
| [0018](0018-human-decisions-from-the-owner-account.md) | 人間の判断は、メインのチャットがオーナーのアカウントで書く | 採用 |
| [0019](0019-work-fields-and-limits.md) | 作品の項目の持ち方と、文字数・タグの上限 | 採用 |
| [0020](0020-work-ownership-policy.md) | 作品の更新は WorkPolicy で所有者だけに許す | 採用 |
| [0021](0021-episodes-drafts-and-publishing.md) | 話のデータ、下書きと公開、文字数の上限 | 採用 |
| [0022](0022-demo-author-initial-work.md) | デモ作者の初期の作品と、デモ作者の移動先 | 採用 |
| [0023](0023-episode-submission-rate-limit.md) | 話の作成・編集の送信は、利用者ごとに 10 分間 30 回まで | 採用 |
| [0024](0024-reader-publication-boundary.md) | 読者向けの作品と話は公開済みの話から決める | 採用 |
| [0025](0025-reader-page-layout.md) | 読者向けの作品ページ・話ページ・見つからない画面の組み方 | 採用 |
| [0026](0026-reader-ruby-notation.md) | 話のルビを Next.js のサーバーで組み立てる | 採用 |
| [0027](0027-notation-emphasis-escape-and-linear-scan.md) | 傍点・`《` のエスケープ・入れ子を一度の線形走査で解釈する | 採用 |
| [0028](0028-new-arrivals-and-publish-visibility.md) | トップの新着の並びと件数、公開の即時反映 | 採用 |
| [0029](0029-mobile-footer-line-height.md) | スマートフォンのフッターの行の高さを整数にする | 採用 |
| [0030](0030-aozora-seed-data.md) | 青空文庫のシードデータの持ち方と投入 | 採用 |
| [0031](0031-scheduled-demo-reset.md) | シードの URL を保ってデモデータを毎日消す | 採用 |
| [0032](0032-restart-demo-notice.md) | 期限切れのログインにデモの再開を案内する | 採用 |
| [0033](0033-server-rendered-session-refresh.md) | 画面移動後のデモセッションはサーバー描画で確認する | 採用 |
