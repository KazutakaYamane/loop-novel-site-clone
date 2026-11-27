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
- スタイルは CSS Modules で書き、部品の `Xxx.module.css` を `Xxx.tsx` の隣に置く。共通の部品は `app/_components/<Name>/` に置く。色・幅・ヘッダーの高さは `app/globals.css` の CSS 変数を使い、スマートフォンの組み方は `@media (max-width: 767px)` に書く(docs/adr/0012)。
- 見た目の値はカクヨムから採取して `docs/kakuyomu-reference/` に残し、そこから書く。カクヨムの CSS・画像・フォントをコピーしない。サイト名は「ヨミカキ」にし、「カクヨム」にしない(docs/adr/0012)。
- 見た目の比較は、その issue で確定する要素を `expect(locator).toHaveScreenshot()` で要素単位で撮る。実行ごとに中身が変わる領域(一覧、ユーザー名、時刻)は `mask` で隠す。既存の基準画像は、issue の "Likely files" に `__screenshots__/` の中のパスで名指しされたものだけ撮り直してよい。それ以外は変えず、自分が足した部分の基準画像を新しいテストで足す(docs/adr/0016)。
- ヘッダーの右側の操作(ログインの導線、ログイン中の表示)は `SiteHeader` の `data-testid="header-actions"` の領域に置く。
- ブラウザから Laravel を呼ぶときは同じオリジンの `/api/*` を使い(`proxy.ts` が転送する)、更新の操作の前に `GET /api/csrf-token` のトークンを `X-CSRF-TOKEN` に付ける(`lib/auth/startDemo.ts`)。ログイン状態の cookie を JavaScript で読み書きしない(docs/adr/0015)。
- デモログインは送信元の IP ごとに 1 時間 10 回までに制限される(docs/adr/0017)。デモログインする E2E と見た目の比較は、`@playwright/test` ではなく `e2e/support/clientAddress.ts` の `test` と `expect` を使い、テストごとに別の利用者の IP から開く。1 つのテストで別の利用者が要るときは `newClient()` と `uniqueClientAddress()` を使う。
- 本物の上限に当てるのは `@AC-F2-7` の E2E だけにする。上限の案内などの見た目を撮るときは、`page.route` でデモログインの API に 429 を返させ、送信元の回数を使わない。
- 手元では E2E と見た目の比較を `scripts/e2e.sh` で動かす(先に Laravel のキャッシュの回数を消す)。`docker compose run --rm e2e npx playwright test` を同じ worktree で繰り返すと、IP を分けない既存のテストが上限に当たる。
- ブラウザが送った `X-User-IP` は `proxy.ts` が捨て、`lib/clientIp/` が決めた利用者の IP に置き換える。Laravel を呼ぶ経路を足すときも、利用者の IP をブラウザのヘッダーから直接取らない(docs/adr/0017)。
