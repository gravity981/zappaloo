// @vitest-environment node
// LANG-01 also forbids hard-coded UI strings. This runs the same ESLint rule as
// `npm run lint` over the frontend sources, and checks that the rule catches one.
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { noLiteralUiStrings } from "../../../eslint.config.js";

const frontendSrc = fileURLToPath(new URL("..", import.meta.url));

function lintWithRule(): ESLint {
  return new ESLint({
    cwd: frontendSrc,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx}"],
        ignores: ["**/*.test.{ts,tsx}"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        // The rule of a disable comment must be known here, or ESLint reports the comment itself.
        plugins: { i18next, "react-hooks": reactHooks as ESLint.Plugin },
        // The hook rule is switched on, so that the disable comment in TypedText.tsx refers to a rule that is run here.
        rules: { ...noLiteralUiStrings, "react-hooks/exhaustive-deps": "error" },
      },
    ],
  });
}

describe("no hard-coded UI strings", () => {
  it("[LANG-01] the frontend sources contain no hard-coded UI strings", async () => {
    const results = await lintWithRule().lintFiles(["**/*.{ts,tsx}"]);
    expect(results.length).toBeGreaterThan(5);
    const problems = results.flatMap((r) =>
      r.messages.map((m) => `${r.filePath}:${m.line} ${m.message}`),
    );
    expect(problems).toEqual([]);
    // The whole frontend is linted: slower than the default timeout when the suite runs in parallel.
  }, 60_000);

  it("[LANG-01] the lint rule reports text and labels written directly into JSX", async () => {
    const code = [
      "export const Greeting = () => <p>Hallo Gäste</p>;",
      'export const Photo = () => <img alt="Hochzeitsfoto" src="/x.png" />;',
      'export const Title = () => <div className="ok" data-testid="ok">{t("home.title")}</div>;',
      "export function Footer() { return <footer>Kontakt</footer>; }",
    ].join("\n");
    const [result] = await lintWithRule().lintText(code, { filePath: "Probe.tsx" });
    expect(result?.messages.map((m) => m.line)).toEqual([1, 2, 4]);
  });
});
