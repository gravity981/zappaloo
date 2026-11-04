// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * LANG-01: no hard-coded UI strings in the frontend. Text in JSX and in
 * user-visible JSX attributes must come from the i18n message files.
 * Exported so the [LANG-01] test can run exactly this rule.
 */
/** @type {import("eslint").Linter.RulesRecord} */
export const noLiteralUiStrings = {
  "i18next/no-literal-string": [
    "error",
    {
      mode: "jsx-only",
      "jsx-attributes": {
        // The plugin's defaults plus attributes that never hold UI text.
        exclude: [
          ...["className", "styleName", "style", "type", "key", "id", "width", "height"],
          ...["data-testid", "to", "href", "src", "role"],
        ],
      },
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "reports/",
      "coverage/",
      "test-results/",
      "playwright-report/",
      // Deliberately broken files for the lint tests
      "**/__fixtures__/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { i18next },
    extends: [reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],
    rules: noLiteralUiStrings,
  },
  {
    // Tests may use literal strings (expected texts, fixtures).
    files: ["frontend/src/**/*.test.{ts,tsx}"],
    rules: { "i18next/no-literal-string": "off" },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
