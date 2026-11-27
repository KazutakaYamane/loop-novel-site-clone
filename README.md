# loop-novel-site-clone

小説投稿サイト「カクヨム」の非公式クローンを、人間がコードを読まずに Claude Code のループだけで作るリポジトリ。人間がレビューする `novel-site-clone` と同じ要件書(`docs/requirements.md`)から作り、速さ・費用・不具合の数を比べる。ループのしくみは [docs/harness/README.md](docs/harness/README.md)、エージェントの規則は [AGENTS.md](AGENTS.md)、設計判断は [docs/adr/](docs/adr/README.md) にある。

| 場所 | 中身 |
|---|---|
| `backend/` | Laravel 13(PHP 8.5)の API |
| `frontend/` | Next.js 16 の画面 |
| `e2e/` | Playwright の E2E テストと見た目の比較 |
| `compose.yaml`、`docker/` | 開発用の Docker Compose(MySQL、Redis、Nginx など) |
| `scripts/worktree-setup.sh`、`scripts/worktree-teardown.sh` | worktree ごとの環境の用意と片付け |
| `.github/` | CI、CODEOWNERS、PR の書式 |

本番環境は無い。すべてローカルの Docker Compose で動かす。

## 準備

必要なもの: Docker(Compose v2)、git、bash、curl。PHP と Node はホストに要らない(コンテナの中で動く)。

```bash
scripts/worktree-setup.sh
```

このスクリプトは次のことをする。何度実行してもよい(詳しくは [docs/adr/0001](docs/adr/0001-worktree-isolation.md))。

1. `.env` を `.env.example` から作る。Compose のプロジェクト名(`loop-<ブランチ名>`)と、すべてのポート(20000〜32599)をこの worktree 専用にする
2. `backend/.env` を作り、`APP_KEY` を生成する
3. イメージを作り、`composer install` と E2E の `npm ci` を行う
4. MySQL と Redis を起動し、マイグレーションを流す
5. Laravel(nginx)と Next.js(web)を起動し、画面が応答するまで待つ

最後に表示される URL で開ける(フロントエンドは `NEXT_PORT`、API は `APP_PORT`。値は `.env` にある)。

片付けは次のとおり。この worktree のコンテナとボリュームだけを消す。

```bash
scripts/worktree-teardown.sh
```

## 動かす

```bash
docker compose ps                # 状態
docker compose logs -f web app   # ログ
docker compose exec app php artisan migrate
```

Next.js は `next dev` で、Laravel は php-fpm + nginx で動き、どちらもソースの変更がすぐに反映される。

トップからデモ作者として始めると、執筆画面の URL `/my/works/<作品ID>/episodes/<話ID>/edit` に移る。ブラウザで `/works/<作品ID>` を開くと、読者向けの作品ページから公開済みの話を読める。公開済みの話がある作品は、トップの「新着小説」に話の公開が新しい順で 30 件ずつ並ぶ。作品カードには公開済みの最新話のタイトルが出て、作品名から作品ページへ進める。2 ページ目以降は `/new-arrivals?page=<番号>` で開く。下書きはワークスペースの執筆画面で読む。

公開した話では `青空《あおぞら》` の直前の漢字や、`｜まち明かり《まちあかり》` の縦線以降の文字にルビが付き、`《《月明かり》》` の中身には傍点が付く。`｜《` は `《` という文字になる。執筆画面は入力した記法をそのまま表示する。

アプリのログは 1 行 1 件の JSON で出る(docs/adr/0014)。Laravel は stderr に Monolog の形(`level_name`、`message`、`context`、`datetime`)で、Next.js のサーバー側は `frontend/lib/logger.ts` から `level`、`message`、`time`、`context` の形で出す。

```bash
docker compose logs --no-log-prefix app | jq -R 'fromjson? | select(.level_name == "ERROR")'
docker compose logs --no-log-prefix web | jq -R 'fromjson? | select(.level == "error")'
```

nginx のアクセスログや Next.js 自身の出力など、JSON でない行も混ざるので `fromjson?` で読み飛ばす。前から使っている worktree の `backend/.env` に `LOG_CHANNEL=stack` が残っていたら `LOG_CHANNEL=json` に直す。

## チェックを手元で動かす

CI と同じものを手元で動かせる。CI のジョブの名前と中身は [docs/harness/README.md](docs/harness/README.md) の「CI のジョブ」にある。

```bash
# backend: Pest(arch、Unit、Feature)、PHPStan、Pint
docker compose exec app vendor/bin/pest
docker compose exec app vendor/bin/phpstan analyse --memory-limit=1G
docker compose exec app vendor/bin/pint --test

# frontend: Vitest、ESLint、型検査
docker compose exec web npx vitest run
docker compose exec web npx eslint . --max-warnings=0
docker compose exec web sh -c 'npx next typegen && npx tsc --noEmit'

# E2E と見た目の比較は scripts/e2e.sh で動かす。先に Laravel のキャッシュを消し、
# デモログインの IP ごとの回数(1 時間 10 回)が前の実行から残らないようにする(docs/adr/0017)。
# 引数は e2e サービスの中の playwright test にそのまま渡す

# e2e: Playwright(機能の E2E)。動画とスクリーンショットは e2e/test-results/ に出る
scripts/e2e.sh --project=dev

# visual: 見た目の比較
scripts/e2e.sh --project=visual-pc --project=visual-sp
# 新しい画面の基準画像を作る(必ずこのコンテナの中で作る)
scripts/e2e.sh --project=visual-pc --project=visual-sp --update-snapshots

# mutation: Infection と Stryker(手元では全体にかかる。CI は PR が変えた行だけ)
docker compose exec app sh -c 'XDEBUG_MODE=coverage vendor/bin/infection --threads=4 --with-uncovered'
docker compose exec web npx stryker run

# guard、ac-coverage などの CI のスクリプトの試験
python3 -m unittest discover -s .github/scripts/tests -p 'test_*.py'
python3 .github/scripts/guard.py --base origin/main
```

## テストと受け入れ条件

要件書の受け入れ条件(`AC-F<n>-<m>`)は、その ID を付けたテストで確かめる([docs/adr/0005](docs/adr/0005-acceptance-criteria-tags.md))。

| テスト | 置き場所 | ID の付け方 |
|---|---|---|
| E2E(Playwright) | `e2e/tests/*.spec.ts` | `test("...", { tag: "@AC-F2-7" }, async ({ page }) => { ... })` |
| 見た目の比較 | `e2e/visual/*.visual.spec.ts`、基準画像は `e2e/visual/__screenshots__/` | 不要 |
| フロントエンドの単体テスト(Vitest) | 対象の隣の `*.test.ts(x)` | 題名に `@AC-F5-1` |
| バックエンドのテスト(Pest) | `backend/tests/{Arch,Unit,Feature}` | `->group('AC-F9-2')` |

PR の本文の `AC:` 行に ID を書くと、CI の ac-coverage がそれぞれにタグ付きのテストがあるかを確かめる。
