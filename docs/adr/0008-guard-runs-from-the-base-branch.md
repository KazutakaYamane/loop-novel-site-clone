# 0008 guard を base ブランチのワークフローの定義で動かす

- 状態: 採用
- 日付: 2026-11-26

## 背景

GitHub Actions の `pull_request` のワークフローは、PR の版のワークフローのファイルで動く。0004 では guard ジョブを `ci.yml` に置き、判定のスクリプトだけを base ブランチから取り出していた。PR が `ci.yml` の guard ジョブの手順を `exit 0` に置き換えると、guard は何も調べずに成功し、`.github/` の変更(保護パス)も見逃した。CODEOWNERS はマージを止めるが、必須チェックの guard 自体が規則違反を報告しなくなる。

## 決定

- guard ジョブを `.github/workflows/guard.yml` に移し、`pull_request_target` で動かす。`pull_request_target` は PR の base ブランチにあるワークフローのファイルで動くので、PR がこのファイルや `.github/scripts/` を書き換えても、guard は書き換える前の定義と判定で動き、その書き換えを保護パスの変更として止める。
- `pull_request_target` のジョブは書き込みの権限とシークレットを持ちうるので、PR のコードを実行しない。base ブランチをチェックアウトし、PR の head(`refs/pull/<番号>/head`)は git のオブジェクトとして取り込むだけにする。guard は `git diff` と `git show` で差分と中身を読む。権限は `contents: read` に絞る(PR の head を取り込む `git fetch` のために、読み取りだけのトークンはチェックアウトに残す)。
- bootstrap の PR(head が `1-bootstrap`、base が `main`)だけは、`main` にまだ `guard.yml` が無いので `pull_request_target` が動かない。この PR のために `.github/workflows/guard-bootstrap.yml` が `pull_request` で同じ判定を動かす。bootstrap の後の PR では、このジョブは名前を `guard-bootstrap-only` に変えて飛ばし、`guard` という名前のチェックが 2 つ並ばないようにする。
- `guard.yml` では、判定のスクリプトはチェックアウトした base ブランチのもの(`.github/scripts/`)をそのまま使う。0004 の `.github/ci-scripts.sh` は、`pull_request` で動く他のジョブ(`ac-coverage`、`mutation`、`visual`)と `guard-bootstrap.yml` で引き続き使う。

## 結果

- guard の判定を変えるには、`guard.yml` か `.github/scripts/` を変える PR をマージする必要がある(保護パスなので人間の承認が要る)。その PR 自体は、変える前の guard で判定される。
- 0004 の「ワークフローのファイル自体は PR の版が使われる」は、guard については当てはまらなくなる。他のジョブは今までどおり PR の版のワークフローで動き、ワークフローを書き換える PR は guard の保護パスの検査で落ちる。
