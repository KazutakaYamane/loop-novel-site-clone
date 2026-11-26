# 0014 アプリのログは 1 行 1 件の JSON で標準出力・標準エラーに出す

- 状態: 採用
- 日付: 2026-11-27

## 背景

要件書 6 章は、アプリのログを構造化(JSON)して出すことを求める。Laravel の既定は `storage/logs/laravel.log` に人が読む形の行を書き、`storage` は名前付きボリュームなので `docker compose logs` から見えない。Next.js のサーバー側にはまだロガーが無い。各機能の issue がログを出す前に、形式と出し先を決める必要がある。

## 決定

- Laravel は既定のチャンネルを `json` にする(`config/logging.php`、`LOG_CHANNEL=json`)。Monolog の `StreamHandler` で `php://stderr` に書き、`JsonFormatter` で 1 行 1 件の JSON にする。`PsrLogMessageProcessor` でメッセージの `{key}` をコンテキストの値で埋める。
  - 項目は Monolog の `JsonFormatter` のまま: `message`、`context`、`level`(数値)、`level_name`、`channel`(`APP_ENV` の値)、`datetime`(ISO 8601、マイクロ秒とタイムゾーン付き)、`extra`。項目名を独自に変えない(Monolog の既定に合わせれば、読む側の道具が多い)。
  - php-fpm は `docker/app/www.conf` の `catch_workers_output = yes` と `decorate_workers_output = no` で worker の stderr を前置きなしにコンテナのログへ流すので、`docker compose logs app` で 1 行ずつ読める。`worker` と `scheduler` は CLI なので stderr がそのままコンテナのログになる。
- Next.js のサーバー側は `frontend/lib/logger.ts` の `logger.debug/info/warn/error(message, context)` を使う。`{"level","message","time","context"}` を 1 行の JSON にし、`warn` と `error` は `console.error`(stderr)、それ以外は `console.log`(stdout)に書く。Edge でも動くよう `process.stdout` は使わない。コンテキストの中の `Error` は `name`、`message`、`stack` に直す。
  - 依存は足さない(pino などは依存の許可リストに無く、この量なら自前で足りる)。
- ログにパスワード、トークン、メールアドレスなどの個人情報を入れない。コンテキストにはユーザーや作品の ID を入れる。ロガーは値を伏せる処理を持たないので、呼ぶ側が守る。

## 結果

- `docker compose logs -f app web` で両方のログを読め、`jq` に渡せる。Laravel の項目名(`level_name`、`datetime`)と Next.js の項目名(`level`、`time`)は揃っていない。集める道具は要件の範囲外なので、揃える必要が出たら新しい ADR で決める。
- php-fpm は worker の 1 行を `log_limit`(既定 1024 バイト)で切る。これより長いログは JSON として読めない行に分かれる。大きなコンテキストを出す必要が出たら、`docker/` の php-fpm の設定を変える ADR を足す。
- 既存の worktree の `backend/.env` に `LOG_CHANNEL=stack` が残っていると、ファイルに書かれたままになる。`LOG_CHANNEL=json` に直す。
