# 0009 guard を `pull_request` の 3 つのワークフローに置く

- 状態: 採用(0008 を置き換える)
- 日付: 2026-11-26

## 背景

0008 は「`pull_request_target` は PR の base ブランチにあるワークフローのファイルで動く」という前提で、guard を `pull_request_target` の `guard.yml` に置いた。この前提は誤りだった。

- GitHub は 2025-12-08 から、`pull_request_target` のワークフローのファイルを、PR の base に関係なく、常にリポジトリの既定のブランチ(`main`)から取る([changelog](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/))。`main` に `guard.yml` が無い間は、`main` 以外のブランチへの PR(bootstrap のブランチへの PR など)で guard がまったく動かなかった。
- GitHub は 2026-12-02 から、公開リポジトリの `pull_request_target` を既定で止める([changelog](https://github.blog/changelog/2026-11-02-pull_request_target-blocked-by-default-december-2))。このリポジトリは公開なので、`main` にマージされた後も、所有者が許可しない限り guard が動かない。

`pull_request` と `workflow_run` も含め、PR の版のワークフローを使わず、しかも base のブランチを選ばずに動く仕組みは GitHub Actions に無い。

## 決定

- guard ジョブは `pull_request`(base のブランチを絞らない)で動かし、同じ手順を `.github/workflows/guard.yml`、`ci.yml`、`ac-coverage.yml` の 3 か所に置く。どれもジョブ ID とジョブ名を `guard` にして、`if:`・`needs:` を付けない。PR が 1 つのワークフローの guard を「何もせずに成功する」ように書き換えても、残りの guard がその書き換えを `.github/` の変更(保護パス)として落とし、`guard` という名前のチェックが失敗する。
- 1 つのファイルを書き換えれば 3 つとも止まる、ということが無いよう、各 guard は共有のファイル(`.github/ci-scripts.sh`、ローカルの action、再利用のワークフロー)を使わず、base ブランチの `.github/scripts/` を取り出して走らせる手順を自分の中に書く。base にまだ無いとき(bootstrap の PR)だけ PR のものを使う。
- `.github/scripts/tests/test_workflows.py` が上の置き方(3 か所以上、`pull_request_target` を使わない、条件を付けない、手順が自己完結している)を確かめる。この試験は guard の最初に、base のスクリプトとして、PR のワークフローに対して走る。
- `pull_request_target` と、bootstrap の PR のためだけにあった `guard-bootstrap.yml` は使わない。

## 結果

- 3 つの guard をすべて書き換える PR は、guard をすり抜けられる。その PR も `.github/` を変えるので、CODEOWNERS の承認が無ければマージされない。
- PR ごとに `guard` という名前のチェックが 3 つ並ぶ。どれか 1 つでも落ちれば `guard` は落ちたものとして扱う。
- 0004 のうち guard を `pull_request_target` に置くとした部分と、0008 の決定は、この ADR で置き換える。他のジョブが `.github/ci-scripts.sh` で base のスクリプトを使う点は変わらない。
