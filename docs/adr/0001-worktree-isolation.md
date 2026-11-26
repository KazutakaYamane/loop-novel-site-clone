# 0001 worktree ごとに Compose プロジェクトとポートを分ける

- 状態: 採用
- 日付: 2026-11-26

## 背景

ループは issue ごとに git の worktree を作って作業する。同じマシンでは、人間がレビューする版(`novel-site-clone`、Compose プロジェクト名 `novel-submission-site-clone`)も動いている。コンテナ、ボリューム、ホストのポートを取り合うと、テストの結果が他の作業に左右され、人間の版のデータを壊すおそれもある。`compose.yaml` と `docker/` は人間の版からコピーしたもので、変えずに使う。

## 決定

- `scripts/worktree-setup.sh` が、worktree のルートに `.env` を `.env.example` から作る。
  - `COMPOSE_PROJECT_NAME=loop-<ブランチ名>`(小文字、英数字と `-` `_` だけ)。`novel-submission-site-clone` と `loop-novel-site-clone` は使わない。
  - `.env.example` の `*_PORT` の変数すべてに、worktree 専用の値を入れる。ブランチ名が `<issue 番号>-...` なら、番号を 1000 で割った余りを区画にする。それ以外(計画用の worktree や CI)は、ブランチ名のハッシュから 1000〜1499 の区画を選ぶ。区画ごとに 20 個のポートを `20000 + 区画 × 20` から順に割り当てる。人間の版は 20000 未満の既定値(8080、3000、13306 など)を使うので重ならない。
  - 割り当てたポートを別のプロセスが使っていれば、上書きせずに失敗する。
  - `UID` と `GID` は実行したユーザーのものにする(bind mount のファイルの所有者をそろえる)。
- 同じスクリプトが、イメージの作成、`composer install`、E2E の `npm ci`、DB の起動とマイグレーション、アプリの起動までを行う。何度実行してもよい。
- `.env.kakuyomu` は、メインのチェックアウトにあれば worktree に symlink する(`docs/kakuyomu-reference.md`)。
- `scripts/worktree-teardown.sh` は、`.env` に書いたプロジェクト名が `loop-` で始まるときだけ、そのプロジェクトのコンテナとボリュームを `docker compose down --volumes` で消す。イメージやほかのプロジェクトには触らない。
- CI の e2e と visual のジョブも、同じ setup スクリプトでアプリを起動する(手元と CI の起動手順を一つにする)。

## 結果

- 並列の worktree どうし、および人間の版とは、コンテナ・ボリューム・ポートを共有しない。
- issue 番号が 1000 違う worktree は同じ区画になる。並列数(`PARALLELISM`)が小さいうちは問題にならない。重なったときは setup がポートの使用中を検出して止まる。
- worktree ごとにイメージ(`loop-<branch>-app` など)が作られ、teardown では消さない。ディスクが足りなくなったら人間が `docker image prune` する。

補足: この決定は実装の都合で見直してよい。
