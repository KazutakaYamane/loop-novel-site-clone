<!--
PR の書式(AGENTS.md の「PR description」)。CI の ac-coverage がこの本文の AC: の行を読む。
- AC: の行には、issue に書かれた受け入れ条件の ID をすべて、カンマ区切りで書く。無ければ空のままにする
- 現在の head commit の CI が green になるまで「完了」「すべて通った」などと書かない
-->

Closes #

AC: 

## 受け入れ条件ごとのテスト

<!-- ID ごとに、それを確かめるテストの名前(E2E なら e2e/tests/ のファイルとテスト名)を書く。
ブラウザで確かめられない条件は、代わりの backend / frontend のテストと、ブラウザで確かめられない理由を書く。 -->

| AC | テスト |
|---|---|

## CI

<!-- 現在の head commit で green になった CI の実行へのリンク -->

## Playwright の記録(UI を変えたとき)

<!-- CI の e2e / visual ジョブが残した動画とスクリーンショット(artifact)へのリンクか画像 -->

## 更新した README.md と docs/harness/ の節

<!-- 節の名前。なければ「なし」 -->
