// @vitest-environment node
// LANG-01 also forbids hard-coded UI strings. This runs the same ESLint rule as
// `npm run lint` over the frontend sources, and checks that the rule catches one.
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import i18next from "eslint-plugin-i18next";
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
        plugins: { i18next },
        rules: noLiteralUiStrings,
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
  });

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
