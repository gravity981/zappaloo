// Helpers shared by the end-to-end tests.
import { execFileSync } from "node:child_process";
import type { BrowserContext, Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

/** A client address of its own for a test: the rate limits count per address. */
export function clientAddress(): string {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `10.${String(part())}.${String(part())}.${String(part())}`;
}

/** Creates an admin with the CLI, as the operator would, and returns the path of its setup link. */
export function createAdmin(username: string): string {
  const output = execFileSync(process.execPath, ["backend/src/cli.ts", "create-admin", username], {
    encoding: "utf8",
    env: { ...process.env, DATA_DIR: ".e2e-data", APP_ENV: "test" },
  });
  const link = /^http\S*(\/set-password\/[\w-]+)$/m.exec(output)?.[1];
  if (!link) throw new Error(`no setup link in the output of create-admin:\n${output}`);
  return link;
}

/**
 * Signs in a fresh admin in this browser context (the platform needs a session, ACS-09):
 * the setup link sets the password, the sign-in sets the session cookie.
 */
export async function signInAsAdmin(page: Page, context: BrowserContext): Promise<string> {
  const username = `u${Math.random().toString(36).slice(2, 10)}`;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": clientAddress() });
  const token = createAdmin(username).split("/").pop() ?? "";
  const set = await page.request.post("/api/password/set", {
    data: { token, newPassword: PASSWORD },
  });
  if (!set.ok()) throw new Error(`setting the password failed: ${await set.text()}`);
  const login = await page.request.post("/api/session", {
    data: { username, password: PASSWORD },
  });
  if (!login.ok()) throw new Error(`signing in failed: ${await login.text()}`);
  return username;
}
