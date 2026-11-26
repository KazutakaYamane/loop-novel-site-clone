import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発サーバーの表示(左下のボタン)が見た目の比較の画像に写らないようにする
  devIndicators: false,
  // E2E のブラウザは compose のサービス名(http://web:3000)で開く。
  // 許可しないと next dev が HMR などの開発用の通信を拒み、クライアントの JS が動かない
  allowedDevOrigins: ["web"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
