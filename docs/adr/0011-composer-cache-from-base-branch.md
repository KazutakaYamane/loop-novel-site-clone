# 0011 CI の composer のキャッシュを base ブランチで作り、PR が読む

- 状態: 採用
- 日付: 2026-11-26

## 背景

CI の `backend` と `mutation` は `~/.composer/cache/files` をキャッシュしていたが、ランナーの composer はそこにキャッシュを置かない。保存の手順は「パスが無い」と警告して何も保存せず、どのジョブも 145 個のパッケージを毎回 `api.github.com` から取っていた。`e2e` と `visual` は、コンテナの中の composer で同じことをしていた。

GitHub Actions のキャッシュは ref ごとに分かれ、PR の ref で作ったものは他の PR から読めない。PR が読めるのは、自分の ref と base ブランチ(と既定のブランチ)のものだけ。

多くの PR が同時に走ると(カナリアなど)、ダウンロードが GitHub の上限に当たり、変更と関係の無いジョブが落ちる。0010 のトークンは上限を上げるが、`github.token` の上限はリポジトリごとに共有され、全 PR の全ジョブが毎回全パッケージを取れば足りなくなる。落ちたジョブから破った規則を読み取れなくなる(docs/harness/README.md「CI のジョブ」)。

## 決定

- `ci.yml` は `COMPOSER_CACHE_DIR=/tmp/composer-cache` に固定し、キャッシュの path を `/tmp/composer-cache/files` にする。キーは `composer-<composer.lock のハッシュ>`。
- 新しいワークフロー `composer-cache.yml` が、どのブランチへの push でもそのブランチの ref にキャッシュを作る(同じキーがあれば何もしない)。PR は base ブランチのキャッシュを読む。必須チェックではない。
- `e2e` と `visual` はキャッシュを読むだけにし(`actions/cache/restore`)、コンテナのユーザーが書けるよう権限を開く。`scripts/worktree-setup.sh` は、`COMPOSER_CACHE_DIR` があればそのディレクトリをコンテナにマウントし、コンテナの composer のキャッシュにする。
- `compose.yaml` と `docker/` は変えない。

## 結果

- base ブランチにキャッシュがあれば、PR のジョブはパッケージをほとんど取りに行かない。base ブランチへの push の直後に開いた PR は、キャッシュができる前に走るとダウンロードに戻る(0010 のトークンで取る)。
- `composer.lock` を変えた PR は、変えたパッケージだけを取る(`restore-keys` で古いキャッシュから始める)。
- 手元で `COMPOSER_CACHE_DIR` を設定していると、そのディレクトリがコンテナにマウントされる。コンテナのユーザーが書けなければ、composer はキャッシュを使わずに続ける。
