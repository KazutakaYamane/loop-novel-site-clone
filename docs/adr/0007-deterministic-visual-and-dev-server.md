# 0007 見た目の比較を安定させるための開発サーバーとフォントの扱い

- 状態: 採用
- 日付: 2026-11-26

## 背景

`visual` ジョブは、Docker Compose で起動した `next dev`(`web` サービス)を `e2e` サービスの Playwright から `http://web:3000` で開き、コミットした基準画像と比べる。規則を守った PR でも `visual` がときどき落ちた。CI が落ちる理由が PR の中身と関係ないと、ループはそれを直せず、カナリアの判定も食い違う。

調べて分かったこと:

- create-next-app の骨組みは `next/font/google`(Geist)を使っていた。`next/font/google` は `next dev` がページをコンパイルするたびに Google Fonts からフォントを取得し、取得に失敗すると黙って代わりのフォントで描画する。CI のネットワークの具合で画面の文字の形が変わり、基準画像と食い違う。
- Next.js 16 の `next dev` は、`localhost` 以外のオリジンからの開発用の通信(HMR など)を既定で拒む。ブラウザは `web` というホスト名で開くので拒まれ、クライアントの JS が開発サーバーとつながらない。見た目の比較が不安定になるうえ、後の issue の E2E(クライアントで動く画面)も動かない。

## 決定

- `next/font/google` を使わない。骨組みの `app/layout.tsx` から Geist を外し、`system` のフォント(`Arial, Helvetica, sans-serif` と `ui-monospace, monospace`)を使う。基準画像はこのフォントで作り直した。フォントを足すときは `next/font/local` でリポジトリに置いたファイルを使う。ESLint の `no-restricted-imports` で `next/font/google` の import を止める。
- `next.config.ts` の `allowedDevOrigins` に `web` を入れる。
- `visual` ジョブが落ちたときは `web` コンテナのログを出す(原因を追えるようにするため)。

## 結果

- 画面のフォントは Playwright のイメージ(`e2e` サービス)にあるフォントで描かれる。基準画像は今までどおり、そのイメージの中で `--update-snapshots` を付けて作る。
- `compose.yaml` と `docker/` は変えていない。
