// ミューテーションテストの設定(AGENTS.md の Protected paths)。
// CI は PR が変えた行だけを --mutate で渡し、前回の結果(incrementalFile)を使い回す。
// thresholds.break を下回ると失敗する。しきい値を下げる変更は人間の承認が要る
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.mts" },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  typescriptChecker: { prioritizePerformanceOverAccuracy: true },
  coverageAnalysis: "perTest",
  mutate: [
    "**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!*.config.*",
    "!vitest.setup.ts",
    "!next-env.d.ts",
    "!.next/**",
    "!node_modules/**",
  ],
  ignorePatterns: [".next", "reports", "coverage"],
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  thresholds: { high: 90, low: 80, break: 0 },
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
};

export default config;
