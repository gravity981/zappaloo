import { defineConfig } from "vitest/config";

// One Vitest run for the whole monorepo. Each workspace is a project; the JSON
// results feed the requirement report (spec/test-strategy.md, section 3).
export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", root: "./shared", include: ["src/**/*.test.ts"] } },
      { test: { name: "backend", root: "./backend", include: ["src/**/*.test.ts"] } },
      {
        // Uses the frontend's Vite config (React plugin), with a browser-like DOM.
        extends: "./frontend/vite.config.ts",
        test: {
          name: "frontend",
          root: "./frontend",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"] } },
    ],
    reporters: ["default", ["json", { outputFile: "reports/vitest.json" }]],
  },
});
