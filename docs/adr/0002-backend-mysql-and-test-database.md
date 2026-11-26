# 0002 バックエンドは MySQL を使い、テストは専用の DB で動かす

- 状態: 採用
- 日付: 2026-11-26

## 背景

`create-project` 直後の Laravel は SQLite を使う設定になっている。要件書は MySQL を固定している。`compose.yaml` は `app` コンテナに MySQL と Redis の接続先を環境変数で渡し、`CACHE_STORE=redis` と `QUEUE_CONNECTION=redis` を指定している。`docker/db/init/01-test-database.sql` は、新しいボリュームにテスト専用の DB `novel_submission_site_test` を作る。

PHP のイメージには phpredis の拡張が入っていない。

## 決定

- `backend/.env.example` を MySQL(`db` サービス)と Redis(`redis` サービス)に向ける。実際の接続先は `compose.yaml` の環境変数が優先される。
- Redis のクライアントは `predis/predis`(許可リストにある)を使い、`REDIS_CLIENT=predis` にする。イメージに拡張を足すより、`docker/` を変えずに済む。
- Pest は MySQL のテスト専用 DB で動かす。`backend/phpunit.xml` で `DB_CONNECTION=mysql`、`DB_DATABASE=novel_submission_site_test` などを指定する。
  - `compose.yaml` が同じ名前の環境変数を渡しているので、`<env force="true">` に加えて `<server>` でも上書きする。Laravel は `$_SERVER` を先に読むため、`<env>` だけでは開発用の DB に `RefreshDatabase` がかかり、開発用のデータが消える(最初の試験でこれが起きた)。
  - キャッシュ、セッション、キュー、メールも、テストでは外部に出ない実装(array、sync)に上書きする。
- テストが本当にテスト専用の DB で動いていることを、`tests/Feature/DatabaseTest.php` で確かめる。
- CI(backend と mutation のジョブ)は、ランナーの PHP と MySQL 8.4 のサービスコンテナで同じ設定のテストを動かす(0004)。

## 結果

- 手元でも CI でも、テストは MySQL の上で動き、開発用の DB を消さない。
- テストで Redis を使いたくなったら、`phpunit.xml`(保護パス)の変更が要る。
