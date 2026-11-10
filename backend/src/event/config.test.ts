import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_EVENTS_DIR, loadConfig } from "../config.ts";
import { tempDir } from "../test-support.ts";
import { EventConfigError, loadEvent } from "./config.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

const eventJson = (changes: Record<string, unknown> = {}) => ({
  id: "my-event",
  name: "My Event",
  slug: "my-event",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
  theme: { config: "theme.json" },
  features: {
    minigames: true,
    snapshots: true,
    gallery: true,
    keepsakes: true,
    rsvp: true,
    treasureHunt: true,
    eventScreen: true,
  },
  settings: { platformOpen: false, snapshotUploadsOpen: false, keepsakeUploadsOpen: false },
  ...changes,
});

/** An events root with one event folder; `files` maps file names to their text. */
function eventsRoot(slug: string, files: Record<string, string>): string {
  const dir = tempDir();
  cleanups.push(dir.remove);
  mkdirSync(join(dir.path, slug), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir.path, slug, name), text);
  return dir.path;
}

const validFiles = (changes?: Record<string, unknown>) => ({
  "event.json": JSON.stringify(eventJson(changes)),
  "theme.json": "{}",
});

function problems(root: string, slug = "my-event"): string {
  try {
    loadEvent(slug, [root]);
  } catch (error) {
    expect(error).toBeInstanceOf(EventConfigError);
    return (error as Error).message;
  }
  throw new Error("expected the configuration to be rejected");
}

describe("event bootstrap directory", () => {
  it("[CFG-02] loads the example event shipped with the platform", () => {
    const loaded = loadEvent("event-muster", [BUNDLED_EVENTS_DIR]);
    expect(loaded.config.id).toBe("event-muster");
    expect(loaded.config.features.minigames).toBe(true);
    expect(loaded.config.settings.platformOpen).toBe(false);
    expect(loaded.theme).toEqual({});
  });

  it("[CFG-02] reads the data volume's events folder before the application's (a private event)", () => {
    const priv = eventsRoot("my-event", validFiles({ name: "Private" }));
    const bundled = eventsRoot("my-event", validFiles({ name: "Bundled" }));
    expect(loadEvent("my-event", [priv, bundled]).config.name).toBe("Private");
    // Only in the application's folder: that one is used.
    const empty = tempDir();
    cleanups.push(empty.remove);
    expect(loadEvent("my-event", [empty.path, bundled]).config.name).toBe("Bundled");
  });

  it("[CFG-02] rejects an invalid configuration with a clear error naming file and key", () => {
    const root = eventsRoot("my-event", validFiles({ timezone: "Mars/Olympus", extra: true }));
    const message = problems(root);
    expect(message).toContain(join(root, "my-event"));
    expect(message).toContain("event.json: timezone: is not a valid IANA time zone");
    expect(message).toContain('unknown key "extra"');
  });

  it("[CFG-02] reports every problem at once, also missing and unreadable files", () => {
    expect(problems(eventsRoot("my-event", {}))).toContain("event.json: file is missing");
    expect(problems(eventsRoot("my-event", { "event.json": "{ nope" }))).toContain(
      "not valid JSON",
    );

    const noTheme = eventsRoot("my-event", { "event.json": JSON.stringify(eventJson()) });
    expect(problems(noTheme)).toContain("theme.json: file is missing");
    const arrayTheme = eventsRoot("my-event", { ...validFiles(), "theme.json": "[]" });
    expect(problems(arrayTheme)).toContain("theme.json: must be a JSON object");

    const features = { ...eventJson().features, minigames: "yes" };
    const several = eventsRoot("my-event", {
      "event.json": JSON.stringify(eventJson({ features, name: "" })),
      "theme.json": "{}",
    });
    const message = problems(several);
    expect(message).toContain("features.minigames");
    expect(message).toContain("event.json: name:");
  });

  it("[CFG-02] the slug in event.json must be the name of its folder", () => {
    const root = eventsRoot("my-event", validFiles({ slug: "other" }));
    expect(problems(root)).toContain('slug "other" must be the name of its folder "my-event"');
  });

  it("[CFG-02] refuses an unsafe or unknown event name", () => {
    const root = eventsRoot("my-event", validFiles());
    expect(problems(root, "../my-event")).toContain("EVENT_SLUG");
    expect(problems(root, "other-event")).toContain('no directory for the event "other-event"');
  });
});

describe("EVENT_SLUG", () => {
  it("[CFG-02] defaults to the example event in dev and test, and is required in staging and prod", () => {
    expect(loadConfig({ DATA_DIR: "/d" }).EVENT_SLUG).toBe("event-muster");
    expect(loadConfig({ DATA_DIR: "/d", APP_ENV: "test" }).EVENT_SLUG).toBe("event-muster");
    const deployed = {
      DATA_DIR: "/d",
      EVENT_SLUG: "our-day",
      PUBLIC_URL: "https://zappaloo.example",
      SESSION_SECRET: "x".repeat(32),
    };
    expect(loadConfig({ ...deployed, APP_ENV: "prod" }).EVENT_SLUG).toBe("our-day");
    for (const appEnv of ["staging", "prod"]) {
      const withoutSlug: Record<string, string> = { ...deployed };
      delete withoutSlug.EVENT_SLUG;
      expect(() => loadConfig({ ...withoutSlug, APP_ENV: appEnv })).toThrow(/EVENT_SLUG: required/);
    }
    expect(() => loadConfig({ DATA_DIR: "/d", EVENT_SLUG: "../x" })).toThrow(/EVENT_SLUG/);
  });
});

describe("session and site settings", () => {
  const deployed = {
    DATA_DIR: "/d",
    APP_ENV: "prod",
    EVENT_SLUG: "our-day",
    PUBLIC_URL: "https://zappaloo.example",
  };

  it("[ACC-05] the session secret is required in staging and prod, at least 32 characters, from a variable or a file", () => {
    expect(() => loadConfig(deployed)).toThrow(/SESSION_SECRET: required in prod/);
    expect(() => loadConfig({ ...deployed, SESSION_SECRET: "short" })).toThrow(/at least 32/);
    expect(loadConfig({ ...deployed, SESSION_SECRET: "s".repeat(40) }).SESSION_SECRET).toBe(
      "s".repeat(40),
    );
    expect(() => loadConfig({ ...deployed, SESSION_SECRET_FILE: "/does/not/exist" })).toThrow(
      /cannot read/,
    );

    const dir = tempDir();
    cleanups.push(dir.remove);
    const file = join(dir.path, "session_secret");
    writeFileSync(file, `${"f".repeat(48)}\n`);
    expect(loadConfig({ ...deployed, SESSION_SECRET_FILE: file }).SESSION_SECRET).toBe(
      "f".repeat(48),
    );
  });

  it("[ACC-05] dev and test get a random secret per process, and cookies are Secure only in staging and prod", () => {
    const a = loadConfig({ DATA_DIR: "/d" });
    const b = loadConfig({ DATA_DIR: "/d" });
    expect(a.SESSION_SECRET).toHaveLength(64);
    expect(a.SESSION_SECRET).not.toBe(b.SESSION_SECRET);
    expect(a.SECURE_COOKIES).toBe(false);
    expect(loadConfig({ ...deployed, SESSION_SECRET: "s".repeat(32) }).SECURE_COOKIES).toBe(true);
  });

  it("[ACC-14] the site address is required in staging and prod and defaults to the dev server", () => {
    const withoutUrl: Record<string, string> = { ...deployed };
    delete withoutUrl.PUBLIC_URL;
    expect(() => loadConfig({ ...withoutUrl, SESSION_SECRET: "s".repeat(32) })).toThrow(
      /PUBLIC_URL: required in prod/,
    );
    expect(loadConfig({ DATA_DIR: "/d" }).PUBLIC_URL).toBe("http://localhost:5173");
  });

  it("[INV-14][ACC-14] keeps only the origin of the site address, so links show no default port", () => {
    const at = (url: string) =>
      loadConfig({ ...deployed, SESSION_SECRET: "s".repeat(32), PUBLIC_URL: url }).PUBLIC_URL;
    expect(at("https://zappaloo.example:443")).toBe("https://zappaloo.example");
    expect(at("https://zappaloo.example:443/")).toBe("https://zappaloo.example");
    expect(at("https://192.168.1.20:8443")).toBe("https://192.168.1.20:8443");
  });

  it("[SEC-02] only trusts X-Forwarded-For when told to", () => {
    expect(loadConfig({ DATA_DIR: "/d" }).TRUST_PROXY).toBe(false);
    expect(loadConfig({ DATA_DIR: "/d", TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
  });
});
