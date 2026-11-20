// Runs once, after the servers are up and before the first test: the installation gets the test world, so that no
// test depends on another to have imported it (the game tests were one serial chain, and one failure re-ran all
// of it). The world tests only read it; those that change a shared setting put it back (game-world.spec.ts).
import { request, type FullConfig } from "@playwright/test";
import { buildTestWorld } from "../backend/src/world/build.ts";
import { clientAddress, createAdmin, PASSWORD } from "./support.ts";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL === undefined) throw new Error("the e2e config has no baseURL");
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  try {
    const username = `world${Math.random().toString(36).slice(2, 8)}`;
    const token = createAdmin(username).split("/").pop() ?? "";
    const set = await api.post("/api/password/set", { data: { token, newPassword: PASSWORD } });
    if (!set.ok()) throw new Error(`setting the password failed: ${await set.text()}`);
    const login = await api.post("/api/session", { data: { username, password: PASSWORD } });
    if (!login.ok()) throw new Error(`signing in failed: ${await login.text()}`);
    const session = (await (await api.get("/api/session")).json()) as { csrfToken: string };
    const imported = await api.post("/api/admin/world", {
      headers: {
        "x-csrf-token": session.csrfToken,
        "content-type": "application/vnd.zappaloo.world",
      },
      data: buildTestWorld(),
    });
    if (!imported.ok())
      throw new Error(`importing the test world failed: ${await imported.text()}`);
  } finally {
    await api.dispose();
  }
}
