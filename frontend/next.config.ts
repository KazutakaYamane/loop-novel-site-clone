import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発サーバーの表示(左下のボタン)が見た目の比較の画像に写らないようにする
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
