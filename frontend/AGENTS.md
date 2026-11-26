<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# frontend/AGENTS.md

`frontend/`(Next.js の画面)と `e2e/` のコードの規則。ルートの `AGENTS.md` に加えて守る。既存の規則の変更と削除には人間の承認が要る。新しい規則は末尾に足す。

## 動かし方

- コマンドは `web` コンテナの中で動かす: `docker compose exec web npx vitest run`、`npx eslint . --max-warnings=0`、`npx next typegen && npx tsc --noEmit`。
- E2E と見た目の比較は `e2e` サービスで動かす: `docker compose run --rm e2e npx playwright test --project=dev`(README.md の「チェックを手元で動かす」)。

## 規則

- 単体テストは `*.test.ts(x)` として、確かめる対象の隣に置く。
- 受け入れ条件を Vitest で確かめるときは、`test` か `describe` の題名に `@AC-F<n>-<m>` を入れる。E2E は `{ tag: "@AC-F<n>-<m>" }` を付ける(docs/adr/0005)。
- E2E のテストに待ち時間や `timeout:` を書かない。要素は `expect(...).toBeVisible()` などの自動の待ちで待つ。
- 画面を足したり変えたりしたら、`e2e/visual/` に見た目の比較のテストと基準画像を足す。基準画像は `e2e` サービスの中で `--update-snapshots` を付けて作る(ホストで作るとフォントの描画が CI と変わる)。
- 文字数の表示は frontend/lib の書式関数を通す。
