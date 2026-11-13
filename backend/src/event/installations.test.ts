// One build, many installations (CFG-01, CFG-04; sw-architecture.md 19.3, 19.3.1): two fresh
// installations shaped differently through the admin API alone, each serving its own; the
// records of an installation all belong to its one event; no second event can be created; and the
// source holds no event-specific names outside the example event and the tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildThemeArchive, validThemeFiles } from "../theme/build.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { EventService } from "./service.ts";

let contexts: TestContext[] = [];
afterEach(async () => {
  for (const context of contexts) await context.close();
  contexts = [];
});

async function freshInstallation(): Promise<TestContext> {
  const context = await createTestApp({ setup: false });
  contexts.push(context);
  return context;
}

/** The headers that sign the admin in. */
type Headers = Record<string, string>;

interface Shape {
  name: string;
  theme?: string;
  pageSlug: string;
  pageTitle: string;
  programItem: string;
}

/** Sets an installation up through the admin API alone, as the admin would. */
async function shape(context: TestContext, shaped: Shape): Promise<Headers> {
  const admin = await signIn(context, "boss", ["admin"]);
  const json = { ...admin, "content-type": "application/json" };
  const post = (url: string, payload: unknown, headers: Record<string, string> = json) =>
    context.app.inject({ method: "POST", url, headers, payload: JSON.stringify(payload) });

  expect(
    (
      await post("/api/admin/event/setup", {
        name: shaped.name,
        timezone: "Europe/Zurich",
        defaultLanguage: "de",
      })
    ).statusCode,
  ).toBe(200);
  if (shaped.theme !== undefined) {
    const archive = buildThemeArchive(validThemeFiles({}, shaped.theme));
    const imported = await context.app.inject({
      method: "POST",
      url: "/api/admin/theme",
      headers: { ...admin, "content-type": "application/gzip" },
      payload: archive,
    });
    expect(imported.statusCode).toBe(200);
  }
  expect(
    (
      await post("/api/content/pages", {
        slug: shaped.pageSlug,
        title: shaped.pageTitle,
        markdown: "Text der Seite.",
        inMore: true,
        placeIds: [],
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await post("/api/admin/rsvp/program-items", {
        name: shaped.programItem,
        startsAt: "2027-06-12T14:00:00.000Z",
      })
    ).statusCode,
  ).toBe(201);
  return admin;
}

/** The names the installation serves: its name, its theme, its pages and its program items. */
async function served(context: TestContext, admin: Headers) {
  const site = (await context.app.inject("/api/site")).json<{
    name: string | null;
    theme: { version: string } | null;
  }>();
  const content = (await context.app.inject({ url: "/api/content", headers: admin })).json<{
    pages: { slug: string; title: string }[];
  }>();
  const items = context.database.sqlite
    .prepare("SELECT name FROM program_items ORDER BY name")
    .all() as { name: string }[];
  return {
    name: site.name,
    themed: site.theme !== null,
    pages: content.pages.map((page) => page.slug),
    items: items.map((item) => item.name),
  };
}

describe("installations of one build (CFG-01)", () => {
  it("[CFG-01] two fresh installations are shaped differently through the admin API and each serves its own", async () => {
    const wedding = await freshInstallation();
    const party = await freshInstallation();
    const weddingAdmin = await shape(wedding, {
      name: "Hochzeit Muster",
      theme: "Winterfest",
      pageSlug: "anreise",
      pageTitle: "Anreise",
      programItem: "Trauung",
    });
    const partyAdmin = await shape(party, {
      name: "Geburtstag Beispiel",
      pageSlug: "wegbeschreibung",
      pageTitle: "Wegbeschreibung",
      programItem: "Grillabend",
    });

    expect(await served(wedding, weddingAdmin)).toEqual({
      name: "Hochzeit Muster",
      themed: true,
      pages: ["anreise"],
      items: ["Trauung"],
    });
    expect(await served(party, partyAdmin)).toEqual({
      name: "Geburtstag Beispiel",
      themed: false,
      pages: ["wegbeschreibung"],
      items: ["Grillabend"],
    });
    // Their data folders are their own.
    expect(wedding.paths.events).not.toBe(party.paths.events);
  });
});

describe("the records of an installation (CFG-04)", () => {
  it("[CFG-04] every event-related record of an installation carries its one event", async () => {
    const context = await freshInstallation();
    await shape(context, {
      name: "Hochzeit Muster",
      theme: "Winterfest",
      pageSlug: "anreise",
      pageTitle: "Anreise",
      programItem: "Trauung",
    });
    const sqlite = context.database.sqlite;
    const events = sqlite.prepare("SELECT id FROM events").all() as { id: string }[];
    expect(events.map((row) => row.id)).toEqual(["event1"]);
    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    const scoped = tables.filter((table) =>
      (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).some(
        (column) => column.name === "event_id",
      ),
    );
    // The records written above are there, and every one of them belongs to event1.
    expect(scoped).toEqual(
      expect.arrayContaining(["program_items", "content_pages", "theme_active"]),
    );
    for (const table of scoped) {
      const stray = sqlite
        .prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE event_id IS NOT 'event1'`)
        .get() as { n: number };
      expect(stray.n, table).toBe(0);
    }
  });

  it("[CFG-04] no second event can be created: there is no route for it, and a database with two events is refused", async () => {
    const context = await freshInstallation();
    const admin = await shape(context, {
      name: "Hochzeit Muster",
      pageSlug: "anreise",
      pageTitle: "Anreise",
      programItem: "Trauung",
    });
    for (const url of ["/api/admin/events", "/api/events"]) {
      const response = await context.app.inject({
        method: "POST",
        url,
        headers: { ...admin, "content-type": "application/json" },
        payload: "{}",
      });
      expect(response.statusCode, url).toBe(404);
    }
    context.database.sqlite
      .prepare("INSERT INTO events (id, created_at, updated_at) VALUES ('event2', 0, 0)")
      .run();
    expect(() => EventService.forInstallation(context.database)).toThrow(/more than one event/);
  });
});

/** The names of the example event and its example data: allowed where the example is defined. */
const EVENT_SPECIFIC = [
  "Event Muster",
  "Trauung",
  "Kirche Muri",
  "Sommerfest",
  "Anna & Ben",
  "Lea & Jonas",
];
const EXAMPLE_FILES = new Set([
  "backend/src/event/service.ts", // the example event (CFG-07)
  "backend/src/rsvp/service.ts", // the example RSVP setup (CFG-07)
  "backend/src/theme/build.ts", // the builder of theme packages, used by the example package
  "scripts/build-example-theme.ts", // the example package itself
]);

/** The source files of the repository, without the tests and the example files. */
function sourceFiles(directory: string, root: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path, root);
    const name = relative(root, path);
    const isSource = /\.(ts|tsx|json|md|html|css)$/.test(name);
    // Tests and the test helpers of the frontend (frontend/src/test) are not the build.
    if (!isSource || name.includes(".test.") || /(^|\/)test\//.test(name)) return [];
    return [name];
  });
}

describe("the source of the build (CFG-01)", () => {
  it("[CFG-01] the source holds no event-specific names outside the example event and the tests", () => {
    const root = join(import.meta.dirname, "..", "..", "..");
    const found: string[] = [];
    let scanned = 0;
    for (const area of ["backend/src", "frontend/src", "shared/src", "scripts"]) {
      if (!existsSync(join(root, area))) continue;
      for (const file of sourceFiles(join(root, area), root)) {
        if (EXAMPLE_FILES.has(file)) continue;
        scanned += 1;
        const text = readFileSync(join(root, file), "utf8");
        for (const name of EVENT_SPECIFIC) {
          if (text.includes(name)) found.push(`${file}: ${name}`);
        }
      }
    }
    // The scan reads the source; an empty scan would pass for the wrong reason.
    expect(scanned).toBeGreaterThan(100);
    expect(found).toEqual([]);
  });
});
