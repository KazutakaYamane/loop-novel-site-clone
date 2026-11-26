# 0015 ログイン状態は Laravel のセッションで持ち、ブラウザは Next.js と同じオリジンから API を呼ぶ

- 状態: 採用
- 日付: 2026-11-27

## 背景

#121 で、ログイン状態の仕組み(セッション・トークン・CSRF 対策)を決める(AGENTS.md「Security-sensitive changes」)。要件は次のとおり。

- AC-F1-3: ログイン状態を表す情報は、ブラウザの JavaScript から読めない。
- AC-F1-4: 他のサイトから、ログイン中の利用者になりすまして更新の操作を送れない。
- AC-F2-2: 会員登録とメールアドレス・パスワードでのログインの処理は通常のサイトと同じものとしてアプリの内部に作り、利用者が画面や API から直接呼べる経路を持たない。デモのボタンはそれを内部で使う。
- AC-F9-4(#131): リセット前にログインしていた利用者が操作すると「デモを始め直す」案内を出す。サーバー側のセッションが無くなったリクエストについて、ログインしていたのか、もともとゲストだったのかを見分ける必要がある。

画面は Next.js、API は Laravel が受け持つ(AGENTS.md「Constraints」)。

## 決定

### ログイン状態

- ログイン状態は Laravel のセッション(`web` ガード、`database` ドライバ)で持つ。ブラウザが持つのはセッションの cookie(既定の名前 `yomikaki_session`)だけで、`HttpOnly`・`SameSite=Lax` を付ける(本番では `SESSION_SECURE_COOKIE` で `Secure` も付ける)。JavaScript から読めない(AC-F1-3)。
- トークン(Sanctum の個人アクセストークンなど)は使わない。ブラウザに渡す認証の情報をセッションの cookie 1 つにして、JavaScript から読める場所に置かないため。`laravel/sanctum` は入れない。
- Laravel の `api` ミドルウェアグループに、cookie の暗号化・セッションの開始・CSRF の検証(`PreventRequestForgery`)を足す。`routes/api.php` のすべての経路がセッションを使い、更新の操作は必ず CSRF の検証を通る。
- ログインしたらセッション ID と CSRF トークンを作り直す(セッション固定攻撃を防ぐ)。

### ブラウザと API のつなぎ方

- ブラウザは Laravel を直接呼ばず、Next.js と同じオリジンの `/api/*` を呼ぶ。Next.js の `proxy.ts` が、`/api/*` を実行時の `INTERNAL_API_URL`(compose では `http://nginx:8080`)へ書き換えて転送する。`next.config.ts` の `rewrites` はビルド時に値が決まり、本番イメージの `INTERNAL_API_URL` を使えないので使わない。
- 同じオリジンなので、セッションの cookie はブラウザから Laravel にそのまま届き、CORS の設定は要らない。
- サーバー側の描画(Server Components)は、ブラウザから届いた `Cookie` ヘッダーをそのまま付けて Laravel の `GET /api/user` を呼び、ログイン中の利用者を得る(`frontend/lib/auth/`)。セッションの cookie が無いリクエストでは呼ばない。ゲストのページ表示のたびにセッションの行が DB に増えるのを避けるため。このために、Laravel のセッションの cookie の名前を `config/session.php` の既定値で固定し、`frontend/lib/auth/` に同じ名前を書く。

### CSRF 対策(AC-F1-4)

- Laravel 13 の `PreventRequestForgery` で、更新の操作(GET・HEAD・OPTIONS 以外)を検証する。ブラウザが付ける `Sec-Fetch-Site: same-origin` があるか、セッションの CSRF トークンと一致するトークン(`X-CSRF-TOKEN` ヘッダーなど)があれば通し、それ以外は 419 で拒む。
- `Sec-Fetch-Site` は安全なコンテキスト(HTTPS か localhost)でしかブラウザが付けない。E2E のブラウザは `http://web:3000` を開くので付かない。このため、画面は更新の操作の前に `GET /api/csrf-token` でトークンを取り、`X-CSRF-TOKEN` ヘッダーに付けて送る。他のサイトのページは、CORS によりこの応答を読めない。
- セッションの cookie の `SameSite=Lax` により、他のサイトからの POST にはそもそもセッションの cookie が付かない。
- フレームワークの `PreventRequestForgery` は単体テストの実行中は検証を飛ばす。backend のテストでは、その判定だけを外した子クラスをコンテナに差し込んで、本物の検証を通す。

### 会員登録とログインの処理(AC-F2-2)

- 会員登録(`App\Actions\Auth\RegisterUser`)と、メールアドレス・パスワードでのログイン(`App\Actions\Auth\LogInWithPassword`、`web` ガードの `attempt`)を、経路を持たないクラスとして作る。`routes/` に会員登録・ログインの経路を作らない。
- デモログイン(`POST /api/demo-sessions`)は、RFC 2606 の予約ドメイン(`example.com`)のメールアドレスと、その場で作る推測できない長いパスワードで `RegisterUser` を呼び、同じメールアドレスとパスワードで `LogInWithPassword` を呼ぶ。パスワードはこの処理の変数の中にしか無く、DB にはハッシュだけが残る。応答・ログ・セッションに入れない(AC-F2-8)。
- デモ専用の権限・ガード・ミドルウェアは作らない。デモのユーザーは、通常のユーザーとして同じ経路で扱う。

### ログインしていたリクエストの見分け方(AC-F9-4 の前提)

- ログインの処理(`LogInWithPassword`)は、セッションとは別に、ログインしたことを表す cookie(`HttpOnly`・`SameSite=Lax`、Laravel が暗号化する。値に利用者の情報を入れない)を付け、ログアウトで消す。この cookie の寿命は、セッションの寿命より長くする。
- サーバー側のセッションに利用者がいない(リセットでセッションと利用者が消えた、または期限切れ)のにこの cookie があるリクエストを、「ログインしていた」と見分ける。どちらも無いリクエストはゲストとする。
- この cookie を付ける処理と、それを使う案内は #131 で作る。#121 はこの見分け方を前提として決めるだけで、cookie はまだ付けない。

## 結果

- ブラウザの JavaScript は、ログイン状態を表す情報に触れない。
- 画面は、更新の操作の前に CSRF トークンを取る 1 回の GET を挟む。
- Laravel を Next.js を通さずに直接開いても、CSRF とセッションの検証は同じに働く。
- サーバー側の描画でログイン中の表示を出すページは、リクエストごとに描画する(Cache Components の動的な部分として `Suspense` の中に置く)。
