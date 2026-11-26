# 0003 テストと静的解析の道具と、その設定

- 状態: 採用
- 日付: 2026-11-26

## 背景

AGENTS.md の「Done means CI is green」は、単体・機能テスト、`arch()` テスト、PHPStan、ESLint、型検査、E2E、ミューテーションテスト、見た目の比較を求めている。人間はコードを読まないので、設定そのものが「テストを飛ばす」「何も確かめない」といった抜け道をふさいでいる必要がある。使える依存は `scripts/loop/dependencies.md` の表に限られる。

## 決定

### バックエンド

- Pest 5(`pestphp/pest`、`pestphp/pest-plugin-laravel`)。テストは `tests/Arch`、`tests/Unit`、`tests/Feature` の 3 つのスイートに置く。`Feature` は `RefreshDatabase` を使う。
- `phpunit.xml` で、何も確かめないテスト、警告、出力を失敗にする(`failOnRisky`、`failOnWarning`、`failOnEmptyTestSuite`、`beStrictAboutTestsThatDoNotTestAnything`、`beStrictAboutOutputDuringTests`)。テストを飛ばす書き方(`->skip()`、`->todo()`、`->only()`、`markTestSkipped` など)は guard が追加行から止める(0004)。`failOnSkipped` と `failOnIncomplete` は使わない。同じ違反で `backend` と `guard` の両方が落ちると、どの規則を破ったかが CI の結果から読みにくくなるため。
- `arch()` テスト(`tests/Arch/ArchTest.php`): Pest の `php`、`security`、`laravel` のプリセット、`App` の全ファイルに `declare(strict_types=1)`、`App` から `env()`・`getenv()`・`putenv()` を呼ばない(環境変数は `config/` で読む。テスト環境だけの分岐を書けなくするため)。
- Larastan 3(PHPStan 2)をレベル `max` で、`app`、`bootstrap/app.php`、`config`、`database`、`routes` にかける。baseline は使わない。テストのコードは Pest のクロージャの型を PHPStan が解釈できないので対象にしない。
- Pint(Laravel のプリセット)で書式を確かめる。ただし `fully_qualified_strict_types` は切る(`backend/pint.json`)。`\Illuminate\Support\Str::slug()` のように完全修飾名をその場で書くことを書式の誤りにしない。AGENTS.md の規則に無い書き方の好みで `backend` を落とさないため。
- 生成された PHPUnit 形式の例のテスト(`assertTrue(true)` と、Laravel が描画する `/` のテスト)は消し、骨組みを確かめる Pest のテストに置き換えた。

### フロントエンド

- Vitest 5 + jsdom + Testing Library。テストは `*.test.ts(x)` を確かめる対象の隣に置く。`expect.requireAssertions` で確認の無いテストを、`allowOnly: false` で `.only` の取り残しを失敗にする。
- ESLint は `eslint-config-next` に加えて、`no-explicit-any` を error にし、`next/font/google` の import を止める(0007)。`eslint-disable` などのコメントと `@ts-ignore`・`@ts-expect-error`・`@ts-nocheck` は guard が追加行から止める(0004)。ESLint 側ではそれらの既定の扱いを変えない(`noInlineConfig` は使わず、`ban-ts-comment` は既定の設定のまま)。`backend` の `failOnSkipped` と同じく、1 つの違反は 1 つのチェックで報告する。CI は `--max-warnings=0` で走らせる。
- 型検査は `next typegen` のあとに `tsc --noEmit`(`LayoutProps` などの型を Next.js が生成するため)。

### E2E と見た目の比較

- Playwright を `e2e/` に置く(`@playwright/test` は `compose.yaml` の `e2e` サービスのイメージ `v1.64.0` と同じ版に固定する)。テストは `e2e` サービスの中から、同じネットワークの `web`(Next.js)と `nginx`(Laravel)を開く。
- プロジェクトは `dev`(機能の E2E、`e2e/tests/`)、`visual-pc`(1280×800)と `visual-sp`(Pixel 7)(見た目の比較、`e2e/visual/`)。`compose.yaml` の `e2e` サービスの既定のコマンドは `--project=dev` を走らせる。
- 動画とスクリーンショットは常に残す(PR に添付するため)。再試行は 0 回、`forbidOnly`、基準画像が無いときに勝手に作らない(`updateSnapshots: "none"`)。
- 見た目の基準画像は、フォントの描画がそろうよう、必ず `e2e` サービスのイメージの中で作る(README.md の手順)。Next.js の開発用の表示(`devIndicators`)は画像に写らないよう切る。

### ミューテーションテスト

- Infection 0.35。0.35 は Pest のアダプタを持たないので、PHPUnit のアダプタから `tests/bin/pest-for-infection.php` を呼ぶ。この包みは次の 4 つをする。PHPUnit の版を正しく返す(Pest は自分の版 5.x を返し、PHPUnit 5 と誤認される)。JUnit のログのクラス名をカバレッジの名前(`P\Tests\...`)に合わせる。JUnit のログのテストファイルのパスを絶対パスにする(Infection は変異ごとの設定を `/tmp` に置くので、相対パスのままだと Pest がテストを見つけられずに失敗する)。Pest の終了コードに合わせて PHPUnit の要約行(`OK (...)` か `FAILURES!`)を出す(Infection は変異を殺せたかをこの行で判断し、Pest はこの行を出さない)。後の 2 つが無いと、テストが通ってもすべての変異が「殺された」ことになり、弱いテストがしきい値を通ってしまう。しきい値は `infection.json5` の `minMsi: 80`、`minCoveredMsi: 90`。CI は `--git-diff-lines` で PR が変えた行だけを変異させ、`--with-uncovered` でテストの無いコードも数える(数えないと、テストの無い分岐がしきい値をすり抜ける)。
- Stryker 10(vitest-runner、typescript-checker)。しきい値は `stryker.config.mjs` の `thresholds.break: 80`。CI は PR が変えた行を `--mutate <file>:<行>-<行>` で渡し、`--incremental` で同じ PR の前回の結果を使い回す。他の PR の結果は使わない(Stryker は incrementalFile にある他のファイルの結果もスコアに数えるので、混ぜると PR のスコアが薄まる)。typescript-checker は最初に全体を型検査するので、その前に `next typegen` で Next.js の型を作る。`vitest.related` は切り、ドライランで全テストを流す。related のままだと、テストから import されないファイルだけを変えた PR でテストが 0 件になり、Stryker が設定エラーで止まる。`allowEmpty` は使わない(テストが 0 件のとき変異を数えずに通してしまう)。全テストを流せば、テストのないコードの変異は NoCoverage としてスコアを下げる。
- `mutation` ジョブは Infection が落ちても Stryker を走らせる(後の手順を `if: !cancelled()` にする)。1 回の実行で backend と frontend の両方の結果が出るので、片方を直した後にもう片方で落ちる往復を避けられる。ジョブの成否は両方の結果で決まる。

## 結果

- 設定ファイルはすべて保護パスになる。しきい値や除外を変えるには人間の承認が要る。
- `@types/node` は Vitest 5 の peer の要求に合わせて `^26`(Docker の Node と同じ主要版)に上げた。
- `laravel/pail`、`laravel/pao`、`phpunit/phpunit`(Pest が依存として入れる)は使わないので `composer.json` から外した。許可リストに無い依存を残さないためでもある。
