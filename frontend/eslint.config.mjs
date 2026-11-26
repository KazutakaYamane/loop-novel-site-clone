import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint の設定(AGENTS.md の Protected paths)
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-disable などのコメントで規則を止められないようにする(AGENTS.md の Forbidden shortcuts)
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": true,
          "ts-nocheck": true,
          "ts-check": false,
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
