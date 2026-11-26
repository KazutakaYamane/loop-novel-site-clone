# 0014 guard 以外のすべての PR のジョブに guard の見張りを置く

- 状態: 採用
- 日付: 2026-11-27

## 背景

0009 で guard を 3 つのワークフローに置き、0012・0013 で落ちた guard が他の guard の成功を失敗に変えるようにした。それでもカナリアの検査で、`guard` ジョブの手順を `exit 0` だけに置き換えた PR が `guard` の失敗として扱われなかった。guard ジョブを定義しているワークフローが 3 つあれば、PR はその 3 つすべての guard を書き換えられる。そのとき、書き換えられていない guard は 1 つも残らず、`guard` という名前のチェックはすべて成功する。

`pull_request` で動くワークフローは、どれも PR の版のファイルで動く。PR の版を使わずに動く `pull_request_target` と `workflow_run` は既定のブランチ(`main`)のファイルしか使わない(0009)。guard ジョブを置く場所を増やしても、PR がそのすべてを書き換えれば同じことになる。ただし、guard を止めたい PR が guard ジョブだけを書き換え、`backend` などの他のジョブはそのまま残すことは多い。

## 決定

- `pull_request` で動く guard 以外のジョブ(`backend`、`frontend`、`e2e`、`visual`、`mutation`、`ac-coverage`)の最後に、`Guard sentinel` という手順を置く。手順は `if: always()` で必ず走り、`continue-on-error: true` で、このジョブ自体の結果は変えない。
- 見張りは base ブランチの `.github/scripts/` を取り出し、`guard.py` を PR の差分に走らせる。違反が無ければ何もしない。違反があれば `guard_checks.py --sentinel` を走らせる。
- `guard_checks.py --sentinel` は、失敗の `guard` チェックを 1 つ足し、他の `guard` の終わりを最長 180 秒待ち、自分のワークフローのものも含めて成功した `guard` をすべて失敗に書き換え、最後に失敗の `guard` をもう 1 つ必ず足す。見張りのジョブは guard より長く走るので、この最後の失敗が最新の `guard` として残る。
- 見張りの印は external_id の `sentinel-<実行の ID>` にし、落ちた guard の印(実行の ID そのもの)と分ける。見張りと同じワークフローの guard を、落ちたものとして待たずに済ませないためである。
- 0009 と同じく、見張りは共有のファイル(`.github/ci-scripts.sh`、ローカルの action)を使わず、手順をジョブの中に書く。base に `guard_checks.py` がまだ無い PR(bootstrap の PR)では何もしない。そのときは guard ジョブだけが判定する。
- 見張りを置いたジョブには `checks: write` を与える。ジョブの `permissions:` はワークフローのものを置き換えるので、各ジョブが要る他の権限も並べて書く。
- `.github/scripts/tests/test_workflows.py` が、マージの後だけ走るもの(`metrics.yml`)を除く `pull_request` のワークフローの guard 以外のジョブすべてに、この手順と権限があることを確かめる。

## 結果

- PR がすべての guard ジョブを書き換えても、見張りの残るジョブが 1 つでもあれば `guard` は落ちる。
- 違反のある PR では、各ジョブの最後に guard.py がもう一度走り、`guard` の失敗のチェックが増える。各ジョブは最長 3 分ほど長くなる。違反の無い PR では、各ジョブが guard.py を 1 回走らせる分(数秒)だけ長くなる。
- 見張りが落ちても(API の失敗など)、そのジョブは落ちない。`backend` などの結果は、そのジョブの受け持つ規則だけで決まる。
- guard ジョブと見張りの手順をすべて書き換える PR は、guard をすり抜けられる。その PR も `.github/` を変えるので、CODEOWNERS の承認が無ければマージされない。
