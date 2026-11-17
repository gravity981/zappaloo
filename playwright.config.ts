import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const PORT = 4173;
const PREVIEW_PORT = Number(process.env.ZAPPALOO_GAME_PREVIEW_PORT ?? 5175);
if (!Number.isInteger(PREVIEW_PORT) || PREVIEW_PORT < 1 || PREVIEW_PORT > 65535) {
  throw new Error("ZAPPALOO_GAME_PREVIEW_PORT must be a valid TCP port.");
}
/** A second installation that nobody has set up, for the setup test (CFG-02). */
const FRESH_PORT = 4174;
const sharedEnv = {
  APP_ENV: "test",
  // Each test comes from its own client address (X-Forwarded-For), so the rate limits
  // of one test do not block the others, which share the machine's address.
  TRUST_PROXY: "true",
  FRONTEND_DIR: "frontend/dist",
};

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
  webServer: [
    {
      // Fresh data directory per run; test build with the game test hook enabled. The example
      // event is set up with the CLI, as in development (CFG-07).
      command:
        "rm -rf .e2e-data && VITE_TEST_HOOKS=true npm run build -w frontend && node backend/src/cli.ts event seed-example && node backend/src/server.ts",
      url: `http://localhost:${PORT}/api/health`,
      // Always a fresh server: a server left over from an earlier run would serve an old build.
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...sharedEnv, PORT: String(PORT), DATA_DIR: ".e2e-data" },
    },
    {
      // Not set up, with the build of the first server (started in order).
      command: "rm -rf .e2e-data-fresh && node backend/src/server.ts",
      url: `http://localhost:${FRESH_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...sharedEnv, PORT: String(FRESH_PORT), DATA_DIR: ".e2e-data-fresh" },
    },
    {
      command: `./node_modules/.bin/vite game-preview --config game-preview/vite.config.ts --port ${PREVIEW_PORT}`,
      url: `http://localhost:${PREVIEW_PORT}/__game-preview/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { APP_ENV: "dev" },
    },
  ],
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-android", use: { ...devices["Pixel 7"] } },
    { name: "mobile-ios", use: { ...devices["iPhone 15"] } },
  ],
});
