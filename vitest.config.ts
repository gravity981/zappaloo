import { defineConfig } from "vitest/config";

// One Vitest run for the whole monorepo. Each workspace is a project; the JSON
// results feed the requirement report (spec/test-strategy.md, section 3).
// The deployment test (Docker) is its own project, run by `npm run test:deploy`
// with its own result file (VITEST_JSON).
// The default of 5 s is too tight when the machine is busy (parallel Playwright workers, Docker).
const testTimeout = 10_000;

export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", root: "./shared", include: ["src/**/*.test.ts"], testTimeout } },
      {
        test: {
          name: "game-engine",
          root: "./game-engine",
          include: ["src/**/*.test.ts"],
          testTimeout,
        },
      },
      {
        test: {
          name: "game-preview",
          root: "./game-preview",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          testTimeout,
        },
      },
      {
        test: {
          name: "theme-editor",
          root: "./theme-editor",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          testTimeout,
        },
      },
      { test: { name: "backend", root: "./backend", include: ["src/**/*.test.ts"], testTimeout } },
      {
        // Uses the frontend's Vite config (React plugin), with a browser-like DOM.
        extends: "./frontend/vite.config.ts",
        test: {
          name: "frontend",
          root: "./frontend",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          testTimeout,
        },
      },
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"], testTimeout } },
      {
        test: {
          name: "deploy",
          include: ["infrastructure/**/*.test.ts"],
          testTimeout: 300_000,
          hookTimeout: 300_000,
          fileParallelism: false,
        },
      },
    ],
    reporters: [
      "default",
      ["json", { outputFile: process.env.VITEST_JSON ?? "reports/vitest.json" }],
    ],
  },
});
