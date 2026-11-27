# backend/AGENTS.md

`backend/`(Laravel の API)のコードの規則。ルートの `AGENTS.md` に加えて守る。既存の規則の変更と削除には人間の承認が要る。新しい規則は末尾に足す。

## 動かし方

- コマンドはすべて `app` コンテナの中で動かす(ホストに PHP は無い): `docker compose exec app vendor/bin/pest`、`vendor/bin/phpstan analyse`、`vendor/bin/pint`。
- テストはテスト専用の DB(`novel_submission_site_test`)で動く(docs/adr/0002)。開発用の DB をテストで使わない。

## 規則

- `app/` のすべての PHP ファイルは `declare(strict_types=1);` で始める(`arch()` テストが確かめる)。
- 環境変数は `config/` の中でだけ `env()` で読み、アプリのコードは `config()` を使う(`arch()` テストが確かめる)。
- テストは Pest の関数形式で書く。DB を使うテストは `tests/Feature/`、使わないものは `tests/Unit/`、構造の規則は `tests/Arch/` に置く。
- 受け入れ条件を backend のテストで確かめるときは、`->group('AC-F<n>-<m>')` を付ける(docs/adr/0005)。
- PHPStan はレベル max。型が合わないときは、コードか型の注釈(`@var`、`@param`、ジェネリクス)を正しく直す。
- API の経路は `routes/api.php` に置く。`api` グループはセッションと CSRF の検証(`PreventRequestForgery`)を通すので、更新の操作をこのグループから外さない。会員登録とパスワードでのログインは `app/Actions/Auth/` の経路を持たないクラスにし、経路を作らない(docs/adr/0015)。
- 複数のブラウザ(セッション)を 1 つのテストで扱うときは、`tests/Feature/Auth/LogoutTest.php` の `asBrowser()` のように `database` のセッションにして、リクエストごとにセッションと認証のガードを読み直す。テストのアプリは前のリクエストのセッションとログイン中の利用者を持ち越すので、`array` のセッションのままでは他のブラウザの状態が混ざる。JSON のリクエストに cookie を付けるには `withCredentials()` が要る。
- ログインした利用者が自分のデータを扱う経路は `routes/api.php` の `my` の下(`auth` ミドルウェア)に置く。個々の作品などを開く・変える経路は、コントローラーの最初で `Gate::authorize('update', $model)` を呼び、Policy で所有者を確かめる。一覧はログイン中の利用者のものだけを DB から選ぶ。テストは所有者、他の利用者(403)、ゲスト(401)、CSRF の無い・偽物のトークン(419)を確かめる(docs/adr/0020)。
- 画面に出す確かめのエラーの文言は、FormRequest の `messages()` に日本語で書き、文言をテストで確かめる。
