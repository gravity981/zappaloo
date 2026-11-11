import { spawnSync } from "node:child_process";
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
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

describe("startup", () => {
  it("[CFG-02] a fresh installation starts without a configured event and creates it, not set up yet", () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const dataDir = join(dir.path, "data");
    // PORT 0 and a short timeout: the server starts, creates the event and is stopped again.
    const result = spawnSync(process.execPath, [server], {
      encoding: "utf8",
      timeout: 4_000,
      killSignal: "SIGTERM",
      env: { PATH: process.env.PATH, DATA_DIR: dataDir, APP_ENV: "test", PORT: "0" },
    });
    expect(result.stderr).not.toContain("Error");
    expect(existsSync(join(dataDir, "zappaloo.db"))).toBe(true);
    const database = openDatabase(dataPaths(dataDir).database);
    try {
      const event = EventService.forInstallation(database).get();
      expect(event).toMatchObject({ id: "event1", name: null, setupComplete: false });
    } finally {
      database.close();
    }
  });

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
