# 0004 CI のジョブの構成と guard の判定方法

- 状態: 採用
- 日付: 2026-11-26

## 背景

このリポジトリでは CI だけが正しさを決める。必須チェックのジョブ名は `scripts/loop/config` の `REQUIRED_CHECKS`(`backend frontend e2e mutation visual ac-coverage guard`)で固定されている。CI そのものは、規則をわざと破った PR(カナリア)で試される。

## 決定

### ジョブと実行環境

- `.github/workflows/ci.yml`(ワークフロー名 `CI`)に `backend`、`frontend`、`e2e`、`visual`、`mutation` を置く。`ac-coverage` は PR の本文を直したとき(`edited`)にも走らせたいので、`.github/workflows/ac-coverage.yml` に分ける。どちらも `pull_request` で、base のブランチを絞らない。`guard` は PR がワークフローを書き換えても動くよう、`pull_request_target` の `.github/workflows/guard.yml` に置く(0008)。
- `backend`、`mutation` は、ランナーの PHP 8.5(setup-php)と MySQL 8.4 のサービスコンテナで動かす。Docker のイメージを作るより速く、テストの設定(0002)は同じ。`frontend` はランナーの Node 26。
- `e2e`、`visual` は `scripts/worktree-setup.sh` で Docker Compose のアプリを起動し、`e2e` サービス(Playwright の公式イメージ)の中からテストする。見た目の基準画像を作る環境と同じにするため。

### CI のスクリプトは base のものを使う

`ac-coverage`、`mutation`、`visual` が使う `.github/scripts/` は、`.github/ci-scripts.sh` が base ブランチから取り出して使う。PR がスクリプトを書き換えて検査をすり抜けるのを防ぐ。base にまだ無いとき(この bootstrap の PR)だけ PR のものを使う。`guard` は base ブランチをチェックアウトして動くので、そのスクリプトをそのまま使う(0008)。スクリプトの試験(`.github/scripts/tests/`)は guard ジョブの最初に走る。

`pull_request` のワークフローのファイルは、GitHub の仕様で PR の版が使われる。ワークフローを書き換える PR は、guard の保護パスの検査と CODEOWNERS で止める。guard 自身は base の版で動くので、書き換えられても止められる(0008)。

### guard の判定

`.github/scripts/guard.py` が `base...HEAD` の差分を読む。

1. **禁止パターン**(Forbidden shortcuts と、Tests の「失敗しようのない確認」): 追加された行だけを、ファイルの種類(本番のコード、テスト、テストの走らせ方を決める設定)ごとの正規表現で調べる。本番のコードでのテスト環境の判定(`runningUnitTests()`、`environment('testing')`、`NODE_ENV === "test"`、`process.env.VITEST`、自動操作のブラウザの検出、テスト環境やツールの名前の文字列)、テストを飛ばす書き方(`->skip()`、`->todo()`、`->only()`、`markTestSkipped`、`test.skip`、`it.only`、`describe.skip`、`test.fixme`、`xit` など)、除外の指定(`--exclude-group`、`--grep-invert`、`testIgnore` など)、検査を黙らせるコメント(`@phpstan-ignore*`、`ignoreErrors`、`eslint-disable*`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、カバレッジとミューテーションの除外)、TypeScript の `any`、リテラルや自分自身との比較、確認をしないことの宣言、テストでの再試行と待ち時間(`retries`、`retry`、`waitForTimeout`、`setTimeout`、`timeout:`、`sleep`、`toPass`)。`.github/` と Markdown は対象外(`.github/` は 2 で止まる)。
   - **テストの入力や名前の特別扱い**: 本番のコードの追加行の `if` か三項演算子が、値をリテラル X と `==`・`===` で比べてリテラル Y を返すだけで、その後(三項演算子なら else 側)にリテラルではない式を返す一般の経路があり、X と Y の両方が PR の変えたテストファイルに現れるときに止める(0、1、-1、空文字は X と Y にしない)。テストの入力にだけ期待どおりの値を返すコードは、ミューテーションテストでも見分けられないため。値の対応表のように一般の経路もリテラルを返すものは止めない。また、PR の変えたテストの題名(8 文字以上)と同じ文字列リテラルを本番のコードに書くことも止める。
2. **保護パス**: base に `.github/CODEOWNERS` があるときだけ調べる(bootstrap の PR は対象外)。
   - 追加も変更も削除も認めない: `.github/`、`.claude/`、`.codex/`、`scripts/loop/`、`AGENTS.md`、`CLAUDE.md`、`docs/requirements.md`、`docs/kakuyomu-reference.md`、`.gitignore`、`metrics/`、検査の設定(PHPStan の設定と baseline、ESLint の設定、`tsconfig*.json`、`infection.json5`、`stryker.config.*`、`phpunit.xml`、`vitest.config.*`、`vitest.setup.*`、`pint.json`、`e2e/playwright.config.*`)。
   - base にあるファイルの変更と削除を認めない(追加は認める): `backend/tests/`、`frontend/**/*.test.*`(と `*.spec.*`、`__tests__/`)、`e2e/`(見た目の基準画像を含む)、`docs/adr/`。名前の変更は削除と追加として扱う。
   - 行の削除を認めない(追記は認める): `backend/AGENTS.md`、`frontend/AGENTS.md`、`docs/adr/README.md`。`docs/adr/README.md` は新しい ADR を一覧に足すために追記を認める。
3. **依存**: すべての `composer.json` と `package.json` について、base と PR の依存(`require`、`require-dev`、`dependencies`、`devDependencies`、`optionalDependencies`、`peerDependencies`、`overrides`、`resolutions`)を比べる。追加・変更されたものは、base の `scripts/loop/dependencies.md` の表にあり、制約の範囲(区間として比べる)が表の制約に収まらなければならない。git や file などの指定と `overrides` は認めない。削除は認める。

### visual

UI のファイル(`frontend/` の本番の `.tsx`・`.jsx`、CSS、`public/`)を変えた PR は、`e2e/visual/` に基準画像を足すか変えなければならない。既存の基準画像の変更は保護パスなので、既存の画面の見た目を変える PR は人間の承認が要る。

### CODEOWNERS

GitHub の CODEOWNERS は「既存のファイルだけ」を表せない。`backend/tests/` などを丸ごと書くと、テストを足すだけの PR もすべて人間の承認が要り、ループが止まる。そこで、検査の設定とハーネスはパターンで、既存のテストと ADR は bootstrap の時点のファイルを 1 つずつ書く。その後に足されたテストの変更は guard が止める(guard は必須チェック)。`backend/AGENTS.md`、`frontend/AGENTS.md`、`docs/adr/README.md` は追記を認めるので CODEOWNERS に書かない。

## 結果

- 正規表現による判定なので、書き方を変えればすり抜けられる場合がある。見つかったら guard と試験に足す。
- 本番のコードで `'test'` や `'ci'` のような文字列を正当に使いたい場合も止まる。そのときは人間に上げる。
- テストでの `timeout:` の指定も止まる。待ち時間は `playwright.config.ts` の既定(1 テスト 60 秒、1 確認 15 秒)に任せる。
