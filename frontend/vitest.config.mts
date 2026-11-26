import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 単体テストの設定(AGENTS.md の Protected paths)
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", ".stryker-tmp/**"],
    // 何も確かめないテストと、.only の取り残しを失敗にする
    expect: { requireAssertions: true },
    allowOnly: false,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "*.config.*", "vitest.setup.ts", "next-env.d.ts", ".next/**"],
    },
  },
});
