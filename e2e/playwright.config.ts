import { defineConfig, devices } from "@playwright/test";

// E2E と見た目の比較の設定(AGENTS.md の Protected paths)。
// compose.yaml の e2e サービス(Playwright の公式イメージ)の中から、同じネットワークの web と nginx を開く。
// 見た目の基準画像はこのイメージで作ったものだけを使う(フォントの描画が環境で変わるため)。
const baseURL = process.env.BASE_URL ?? "http://web:3000";

export default defineConfig({
  forbidOnly: true,
  retries: 3,
  // next dev はページを初めて開いたときにコンパイルするので、並列にしすぎない
  workers: 2,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css" },
  },
  // 基準画像が無いときに CI で勝手に作らせない。作るときは --update-snapshots を明示する
  updateSnapshots: "none",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    video: "on",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "dev", testDir: "./tests", use: { ...devices["Desktop Chrome"] } },
    {
      name: "visual-pc",
      testDir: "./visual",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    { name: "visual-sp", testDir: "./visual", use: { ...devices["Pixel 7"] } },
  ],
});
