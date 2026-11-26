# 0010 CI の composer install にジョブのトークンを渡す

- 状態: 採用
- 日付: 2026-11-26

## 背景

composer は、パッケージの多くを GitHub の zipball(`api.github.com`)から取る。トークンが無いと、GitHub の API の上限(IP ごとに 1 時間 60 回)に数えられる。GitHub Actions のキャッシュは PR の ref ごとに分かれ、マージ先のブランチで作ったもの以外は他の PR から読めない。そのため新しい PR は composer のキャッシュを持たず、`backend`、`mutation`、`e2e`、`visual` のそれぞれで全パッケージを取り直す。

カナリアのように多くの PR が同時に走ると、変更と関係の無いジョブが、ダウンロードの失敗でたまに落ちた(手元では同じテストを何度走らせても落ちない)。そうなると、落ちたジョブから破った規則を読み取れなくなる(docs/harness/README.md「CI のジョブ」)。

## 決定

- `ci.yml` のワークフロー全体の環境変数 `COMPOSER_AUTH` に、ジョブのトークン(`github.token`、権限は `contents: read`)を `github-oauth` として入れる。
- `scripts/worktree-setup.sh` は、コンテナの中の `composer install` に `-e COMPOSER_AUTH` で渡す。値が無いとき(手元)は何も渡らない。
- `compose.yaml` と `docker/` は変えない。

## 結果

- composer のダウンロードは、トークンごとの上限(1 時間 1,000 回以上)に数えられ、同時に走る PR が増えても落ちにくくなる。
- PR のコード(composer のスクリプトなど)からこのトークンが読める。権限は読み取りだけで、ジョブが終われば失効する。
- Docker Hub からのイメージの取得など、他のダウンロードの失敗はこの決定では防げない。
