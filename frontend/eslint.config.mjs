import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint の設定(AGENTS.md の Protected paths)。
// ESLint や TypeScript の検査を止めるコメントは guard ジョブが追加行から見つけて止める(docs/adr/0004)。
// ここでは ESLint の既定の扱いを変えない
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // next/font/google は next dev と next build のたびに Google Fonts から取得し、失敗すると黙って代わりのフォントを使う。
      // CI で見た目の比較が不安定になるので使わない(docs/adr/0007)
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/font/google",
              message:
                "next/font/google はネットワークに依存し見た目の比較を不安定にする。next/font/local か system フォントを使う(docs/adr/0007)",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "reports/**",
    ".stryker-tmp/**",
  ]),
]);

export default eslintConfig;
