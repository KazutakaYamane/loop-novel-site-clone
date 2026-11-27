# 0017 利用者の IP の決め方と、デモログインの回数の制限、E2E がその制限と両立する方法

- 状態: 採用
- 日付: 2026-11-27

## 背景

AC-F2-7 は、デモログインを IP アドレス単位で 1 時間に 10 回までに制限し、超えたらその旨を表示することを求める(#132)。

- ブラウザは Next.js と同じオリジンの `/api/*` を呼び、`proxy.ts` が Laravel(nginx の 8080)へ転送する(docs/adr/0015)。Laravel が直接見る接続元は Next.js のサーバーになる。
- nginx(`docker/nginx/default.conf.template`)は、届いたリクエストの `X-User-IP` を、無条件に Laravel の `REMOTE_ADDR` にしていた。ブラウザが `X-User-IP` を付けて送り、`proxy.ts` がそのまま転送すると、利用者は IP を自由に選べた。
- Next.js 16 は、届いたリクエストに `X-Forwarded-For` が無いときだけ、接続元の IP をそれに入れる(`base-server.js` の `??=`)。ブラウザが `X-Forwarded-For` を送ると、その値がそのまま残り、`proxy.ts` から本当の接続元は見えない。`proxy.ts` に接続元の IP を得る API は無い。
- E2E(`dev`)と見た目の比較(`visual-pc`・`visual-sp`)は、どれも `e2e` という 1 つのコンテナ(同じ IP)からブラウザを動かす。後の issue のほぼすべてのテストがデモログインするので、1 回の CI の実行で 10 回をはるかに超える。
- compose の Laravel のキャッシュ(`CACHE_STORE=redis`)は worktree ごとに実行をまたいで残る。#121 の既存のテスト(変えられない)は IP を分けずにデモログインするので、同じ worktree で 3 回ほど走らせると上限に当たる(実測)。
- `e2e/playwright.config.ts`・`e2e/package.json`・`.github/` は変えられない。テストの環境だけで制限を外す・上限を変える分岐は作らない(AGENTS.md「Forbidden shortcuts」)。

## 決定

### 利用者の IP

- 利用者の IP は、Next.js が受けたリクエストの `X-Forwarded-For` の**最後の値**とする(`frontend/lib/clientIp/`)。IPv4 か IPv6 の形でなければ、IP は無いものとする。
  - 前段にロードバランサーが無いとき、この値は Next.js が入れた接続元の IP になる。
  - 前段にロードバランサーがあるとき(本番の想定)、ロードバランサーは自分が見た接続元を末尾に足すので、最後の値はロードバランサーが見た利用者の IP になる。それより前の値はブラウザが自由に書けるので使わない。
- `proxy.ts` は、ブラウザが送った `X-User-IP` を必ず捨て、上で決めた IP を `X-User-IP` に入れて Laravel に転送する。IP が無ければ `X-User-IP` を付けない(nginx は接続元、つまり Next.js の IP を使う)。
- nginx は、`X-User-IP` を内部のネットワーク(プライベートアドレス `10/8`・`172.16/12`・`192.168/16`・`fc00::/7` とループバック)からの接続でだけ信じ、IP の文字だけでできた値なら `REMOTE_ADDR` にする。それ以外の接続(外から 8080 に直接届いたもの)は、ヘッダーを無視して接続元を使う。本番では 8080 に Next.js からしか届かない(セキュリティグループ)ので、これは多重の守りである。
- Laravel は `X-Forwarded-For` を信頼しない(TrustProxies を設定しない)。`$request->ip()` は nginx が入れた `REMOTE_ADDR` を返す。

この決め方で残る弱点: Next.js を前段のプロキシ無しで直接公開すると、ブラウザが送った `X-Forwarded-For` が残るので、利用者は IP を選べる。手元の Docker Compose がこの形である。本番では、接続元を `X-Forwarded-For` の末尾に足すロードバランサーの後ろに Next.js を置くことを前提とする。Next.js に届く前に必ず接続元を足させるには、Next.js をカスタムサーバーで動かすか、compose に前段のプロキシを足す必要があり、どちらもこの issue の範囲を超える。

### 回数の制限

- Laravel のレートリミッター `demo-login` を `AppServiceProvider` に定義し、`POST /api/demo-sessions` に `throttle:demo-login` を付ける。`$request->ip()` ごとに 1 時間 10 回(`config/rate-limits.php` の `demo_login_per_hour`)。超えると 429 と `Retry-After` を返し、ユーザーを作らない。
- 回数は環境変数で変えない。テストの環境でも本番と同じ値で働く。compose.yaml の `app` にある `DEMO_RATE_LIMIT_PER_HOUR` は人間がレビューする版から写したもので、このアプリは読まない(compose は変えない)。
- 回数は CSRF の検証(`api` グループ)を通ったリクエストだけを数える。
- `startDemo()` は、始められたら `true`、429 なら `"rate-limited"`、それ以外の失敗は `false` を返す(既存のテストが `true`・`false` を確かめているので、真偽値の部分は変えない)。デモのボタンは 429 のとき「デモを始められる回数の上限に達しました。1時間ほどおいてからもう一度お試しください。」を出す。それ以外の失敗の文言は変えない。
- ヘッダーのボタンは、これまで失敗の文言を隠していた。上限を知らせるために、ボタンの下に重ねて出す。カクヨムにデモログインの上限の画面は無いので、文言は自分で書き、色と線は既存の CSS 変数(`--color-error`・`--color-border`)を使う。

### E2E と見た目の比較が制限と両立する方法

- デモログインするテストは、`e2e/support/clientAddress.ts` の `test` を使う。この `test` は、テストごとに文書用の IPv6 アドレス(RFC 3849 の `2001:db8::/32`)から無作為に選んだ IP を、ブラウザの `X-Forwarded-For`(Playwright の `extraHTTPHeaders`)に入れる。手元の compose には前段のプロキシが無いので、上の決め方により、これがそのテストの利用者の IP になる。前段のロードバランサーの後ろにいる、別々の利用者を模している。
  - 本番のコードにテストのための分岐は無い。制限は本番と同じ条件(IP ごと、1 時間 10 回)で働き、`@AC-F2-7` の E2E は 1 つの IP から 10 回成功させた後の 11 回目で、本物の 429 と案内を確かめる。
  - 無作為な IP は実行をまたいでも重ならないので、同じ worktree で何度走らせても、この `test` を使うテストの回数は溜まらない。
- 上限の案内の見た目は、`page.route` でデモログインの API に 429 を返させて撮る(`e2e/visual/demo-login-rate-limit.visual.spec.ts`)。送信元の回数を使わないので、並列に動く `visual-pc`・`visual-sp` の他のテストに影響しない。テストの側でブラウザの通信を差し替えるだけで、本番のコードに分岐は入らない。
- #121 の既存のテストは IP を分けずにデモログインする(1 回の CI の実行で、`e2e` のジョブで 2 回、`visual` のジョブで 2 回。ジョブごとに新しい環境なので上限に届かない)。手元では `scripts/e2e.sh` で E2E と見た目の比較を動かす。このスクリプトは、テストの前にアプリの外から `php artisan cache:clear` で Laravel のキャッシュ(回数のカウンタ)を消す。CI はこのスクリプトを使わない。
- この方法を `frontend/AGENTS.md` の規則にする。

## 結果

- 1 つの IP からのデモログインは 1 時間に 10 回までになり、超えるとトップでもヘッダーでも案内が出る。
- 後の issue の E2E は、デモログインの回数を気にせず、テストを足せる。ただし `e2e/support/clientAddress.ts` の `test` を使う必要がある。`@playwright/test` から直接 `test` を使ってデモログインするテストが増えると、CI の 1 回の実行で上限に当たる。
- 手元の compose では、ブラウザが `X-Forwarded-For` を送れば IP を選べる。この弱点は本番の構成(前段のロードバランサー)で塞ぐ前提であり、手元で制限が破られないことは保証しない。
- `scripts/e2e.sh` の `cache:clear` は Laravel のキャッシュのストア全体を消す。手元の開発用の環境だけで使う。
