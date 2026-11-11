import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database/database.ts";
import { dataPaths } from "./data-dir.ts";
import { EventService } from "./event/service.ts";
import { tempDir } from "./test-support.ts";

const server = fileURLToPath(new URL("./server.ts", import.meta.url));
const cleanups: (() => void)[] = [];

/** Polls until `read` returns a value, at most 30 s. */
async function until<T>(read: () => T | undefined): Promise<T> {
  for (let waited = 0; waited < 30_000; waited += 100) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out");
}
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

describe("startup", () => {
  it("[CFG-02] a fresh installation starts without a configured event and creates it, not set up yet", async () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const dataDir = join(dir.path, "data");
    // PORT 0: the server starts, migrates and creates the event; then it is stopped again.
    const child = spawn(process.execPath, [server], {
      env: { PATH: process.env.PATH, DATA_DIR: dataDir, APP_ENV: "test", PORT: "0" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    try {
      // Wait for the event instead of a fixed time: migrations are slow while the suite runs.
      const event = await until(() => {
        if (!existsSync(join(dataDir, "zappaloo.db"))) return undefined;
        const database = openDatabase(dataPaths(dataDir).database);
        try {
          return EventService.forInstallation(database).get();
        } catch {
          return undefined;
        } finally {
          database.close();
        }
      });
      expect(event).toMatchObject({ id: "event1", name: null, setupComplete: false });
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
    expect(stderr).not.toContain("Error");
  }, 60_000);

  it("[CFG-02] prod needs no event variable: the event is set up in the admin area", () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const result = spawnSync(process.execPath, [server], {
      encoding: "utf8",
      timeout: 20_000,
      env: { PATH: process.env.PATH, DATA_DIR: join(dir.path, "data"), APP_ENV: "prod", PORT: "0" },
    });
    expect(result.status).toBe(1);
    // It fails for the other prod settings, not for the event.
    expect(result.stderr).toContain("PUBLIC_URL: required in prod");
    expect(result.stderr).not.toContain("EVENT_SLUG");
  });
});
