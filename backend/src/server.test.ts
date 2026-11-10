import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { tempDir } from "./test-support.ts";

const server = fileURLToPath(new URL("./server.ts", import.meta.url));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function start(env: Record<string, string>, events: Record<string, string>) {
  const dir = tempDir();
  cleanups.push(dir.remove);
  const eventsDir = join(dir.path, "events");
  mkdirSync(join(eventsDir, "broken"), { recursive: true });
  for (const [name, text] of Object.entries(events)) {
    writeFileSync(join(eventsDir, "broken", name), text);
  }
  const dataDir = join(dir.path, "data");
  const result = spawnSync(process.execPath, [server], {
    encoding: "utf8",
    timeout: 20_000,
    env: {
      PATH: process.env.PATH,
      DATA_DIR: dataDir,
      EVENTS_DIR: eventsDir,
      PORT: "0",
      ...env,
    },
  });
  return { ...result, dataDir };
}

describe("startup", () => {
  it("[CFG-02] refuses to start with an invalid event configuration and says what is wrong", () => {
    const result = start(
      { EVENT_SLUG: "broken" },
      { "event.json": JSON.stringify({ id: "broken", name: "" }), "theme.json": "{}" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EventConfigError: invalid event configuration in");
    expect(result.stderr).toContain("event.json: name:");
    expect(result.stderr).toContain("event.json: slug:");
    // Nothing was started, and no database was created.
    expect(result.stdout).not.toContain("starting");
    expect(existsSync(join(result.dataDir, "zappaloo.db"))).toBe(false);
  });

  it("[CFG-02] refuses to start when the event folder does not exist", () => {
    const result = start({ EVENT_SLUG: "missing-event" }, {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no directory for the event "missing-event"');
  });

  it("[CFG-02] staging and prod need EVENT_SLUG, so the example event is never used by accident", () => {
    const result = start({ APP_ENV: "prod" }, {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EVENT_SLUG: required in prod");
  });
});
