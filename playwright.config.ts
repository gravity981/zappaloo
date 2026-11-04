import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const PORT = 4173;

// End-to-end tests on desktop and mobile viewports (spec/test-strategy.md, section 2),
// against the backend serving the built frontend, as in production.
// The JSON results feed the requirement report.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/playwright.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    // Fresh data directory per run; test build with the game test hook enabled.
    command:
      "rm -rf .e2e-data && VITE_TEST_HOOKS=true npm run build -w frontend && node backend/src/server.ts",
    url: `http://localhost:${PORT}/api/health`,
    // Always a fresh server: a server left over from an earlier run would serve an old build.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ENV: "test",
      PORT: String(PORT),
      DATA_DIR: ".e2e-data",
      FRONTEND_DIR: "frontend/dist",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-android", use: { ...devices["Pixel 7"] } },
    { name: "mobile-ios", use: { ...devices["iPhone 15"] } },
  ],
});
