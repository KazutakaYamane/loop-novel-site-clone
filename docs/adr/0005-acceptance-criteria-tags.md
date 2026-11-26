# 0005 受け入れ条件の ID をテストに付ける方法

- 状態: 採用
- 日付: 2026-11-26

## 背景

AGENTS.md は、PR の `AC:` 行の ID ごとに、その ID のタグが付いたテストを求めている。E2E は `{ tag: "@AC-F2-7" }` と決まっているが、ブラウザで確かめられない条件(CSRF、4:00 のリセットの予定など)は backend か frontend のテストに同じタグを付ける。ID をコメントに書いただけのものや、走らないテストを数えてはいけない。

## 決定

- タグの付け方
  - Playwright: `test("...", { tag: "@AC-F2-7" }, ...)`。`describe` の題名や `tag` でもよい(Playwright が子のテストに引き継ぐ)。
  - Vitest: `test` か `describe` の題名に `@AC-F5-1` を入れる(Vitest のタグ機能は、使うタグをすべて設定ファイルに書く必要があり、設定ファイルは保護パスなので使わない)。
  - Pest: `->group('AC-F9-2')`。
- ac-coverage のジョブは、各ツールにテストの一覧を出させて(`playwright test --list --reporter=json`、`vitest list --json`、`pest --list-groups`)、そこから ID を探す。コメントの中の ID や、スイートに入らない場所のテストは数えない。`test.skip()` などで走らないと分かっている Playwright のテストも数えない。
- `AC:` 行が無い PR、ID 以外の語がある PR、`docs/requirements.md` に無い ID がある PR は失敗にする。空の `AC:` は通す。
- 本文に `Closes #<番号>` があり、その issue に `## AC` の節があれば、issue の ID と `AC:` 行の ID が一致しなければ失敗にする。

## 結果

- 1 つの ID に複数の種類のテストを付けてもよい。ジョブはどれか 1 つあれば通す。
- ID を付けたテストが実際に通ることは、e2e、backend、frontend の各ジョブが確かめる。
