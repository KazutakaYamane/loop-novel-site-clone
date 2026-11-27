---
name: loop-operator
description: メインのチャットで work ループを見張り、escalation が来たら解決の選択肢を人間に出して、選ばれたものを実行する。ループの起動・状態確認・escalation の対応・承認を頼まれたとき、または「ループを管理して」「エスカレートを見て」と言われたときに使う。
---

# ループの見張り役(メインのチャット)

人間がするのは選ぶことだけ。選択肢を作る、選ばれたものを実行する、ループを再開する、はすべてこのチャットが行う。
ループ(オーケストレーターとエージェント)は bot のアカウントで動き、このチャットはオーナー(`scripts/loop/config` の `CODEOWNER`)のアカウントで動く。CI と issues.py は、承認や回答をオーナーが書いたものだけ認める(docs/adr/0017)。

## 始める前に

1. メインのチェックアウト(デフォルトブランチ)にいることを確かめる。ループの worktree(`../<repo>.loop/worktrees/`)のファイルは編集しない。ループのブランチのテストや実装を自分で直さない。直すのはループの仕事。
2. `gh api user --jq .login` が `CODEOWNER` と同じか確かめる。違えば人間に伝えて止まる。bot のトークン(`GH_TOKEN`、`<repo>.loop/bot-token`)は使わない。
3. `scripts/loop/ctl.sh status` で状態を見て、1〜2 行で伝える。止まっていて、人間が動かしたいと言えば `scripts/loop/ctl.sh start work`(Codex なら `work codex`、交互なら `work mixed`)で起動する。

## 見張る

- `scripts/loop/ctl.sh escalations` で未解決の escalation を見る。あれば「escalation に対応する」へ進む。
- 無ければ `scripts/loop/ctl.sh await` をバックグラウンドで動かす(Claude Code なら Bash の `run_in_background`、timeout は上限の 7200000)。新しい escalation が出るか、ループが止まると終わり、このチャットが呼び戻される。時間切れで終わったら、もう一度動かす。
- 呼び戻されたら、状態を 1〜2 行で伝え、escalation があれば対応する。ループが「完了」なら、そう伝えて見張りを終える。

## escalation に対応する

各 issue について、次を読んでから選択肢を作る。

- `gh issue view <N> --comments`(最後の escalation のコメントの 4 点と、`test_change_request`)
- 関係する受け入れ条件(`docs/requirements.md`)と ADR(`docs/adr/`)
- 必要なら、ブランチの差分(`git -C ../<repo>.loop/worktrees/<N>-* log -p origin/main..HEAD`)と CI のログ

選択肢は 2〜4 個。推奨するものを先頭に置き、ラベルの末尾に「(推奨)」と付ける。各選択肢の説明には、選んだら何が起きるか(実行するコマンドと、その後のループの動き)を書く。人間が他の案を自由に書けるので、「その他」は作らない。

質問は回答のツールで出す。Claude Code では `AskUserQuestion`(1 回に 4 問まで。escalation が多ければ分ける)、Codex では `request_user_input`。どちらも無ければ、番号付きの一覧で出して番号で答えてもらう。各問いは、それだけ読んで判断できるように書く(issue 番号と題、何が起きて止まったか、選択肢ごとの違い)。

### 種類ごとの選択肢

| 止まった理由 | 選択肢の例 | 選ばれたら実行すること |
|---|---|---|
| 既存テストの変更の申請(`test_change_request` がある) | 申請どおり承認する / 一部だけ承認する / 分け直す | `ctl.sh approve <N>`(一部なら `ctl.sh approve <N> <path> ...`)/ `ctl.sh replan <N> "<理由>"` |
| 申請の印は無いが、既存テストを変えたいと書いている | コメントに挙がったファイルを承認する / 分け直す | `ctl.sh approve <N> <path> ...` / `ctl.sh replan <N> "<理由>"` |
| 受け入れ条件があいまい・食い違う | 解釈ごとに 1 つ(具体的に書く) | `ctl.sh answer <N> "<選ばれた解釈>"` |
| ADR と食い違う | 新しい ADR で置き換える(その内容)/ issue の方針を ADR に合わせる | 置き換えはこのチャットが ADR を足す PR を作り、オーナーとしてマージしてから `ctl.sh answer`。合わせる方は `ctl.sh answer <N> "<方針>"` |
| 許可リストにない依存、既存の列を変えるマイグレーション、保護パスの変更 | このチャットが必要な変更を main に入れる / 別の方法をとらせる / 分け直す | 変更は PR にしてオーナーとしてマージしてから `ctl.sh answer`。それ以外は `ctl.sh answer` か `ctl.sh replan` |
| 試行回数・費用・同じ失敗の繰り返し、CI を確かめられない | そのまま再開する / 原因(具体的に)を伝えて再開する / 分け直す | `ctl.sh answer <N> "<再開の指示>"` / `ctl.sh replan <N> "<理由>"` |
| 計画の escalation(`feature` が false。質問だけの issue) | 質問への答えごとに 1 つ | `ctl.sh answer <N> "<答え>"`(issue は閉じる)の後、`ctl.sh start plan` |

`answer` の文は、ループのエージェントが読んでそのまま従えるように、具体的に書く(何を、どこまで変えてよいか)。人間が自由に書いた答えは、意味を変えずにそのまま渡す。

## 選ばれた後

1. 選ばれたコマンドを実行し、結果を 1 行で伝える。失敗したら、エラーをそのまま伝える。
2. `scripts/loop/ctl.sh status` が動作中でなければ `scripts/loop/ctl.sh start work` で起動し直す(前回と同じ引数)。
3. 「見張る」に戻る。

## してはいけないこと

- 人間が選ぶ前に、承認・回答・分け直しをしない。推奨があっても、選ばれるまで実行しない。
- `docs/requirements.md` を書き換えない。あいまいさへの答えは `ctl.sh answer` で issue に残す。
- ループの worktree やブランチを自分で編集・push しない。
