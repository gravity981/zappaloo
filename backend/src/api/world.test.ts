import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicWorld, WorldStatus } from "@zappaloo/shared";
import { buildArchive } from "../packages/build.ts";
import { buildTestWorld, testWorldFiles } from "../world/build.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;
// The JSON body of a response, typed by the caller.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body type
const bodyOf = <T>(response: { json: () => unknown }): T => response.json() as T;

function upload(ctx: TestContext, headers: Headers, archive: Buffer) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/admin/world",
    headers: { ...headers, "content-type": "application/vnd.zappaloo.world" },
    payload: archive,
  });
}

/** The folders of the imported worlds of the event. */
function worldFolders(ctx: TestContext): string[] {
  const dir = join(ctx.paths.events, "event1", "world");
  return existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith("staging-")) : [];
}

/** A test world with a different name, so two imports can be told apart. */
function namedWorld(name: string): Buffer {
  const files = testWorldFiles();
  files["manifest.json"] = Buffer.from(
    JSON.stringify({
      kind: "zappaloo-world",
      formatVersion: 1,
      name,
      startMap: "kirche",
      tileSize: 16,
    }),
  );
  return buildArchive(files);
}

describe("the world of the event (MAP-04, MAP-05, MAP-06, MAP-08, MAP-09, MAP-10)", () => {
  it("[MAP-01][MAP-04][MAP-05] an admin imports a world package of Tiled maps; the admin area and the players' world show it", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const imported = await upload(ctx, admin, buildTestWorld());
    expect(imported.statusCode).toBe(200);
    const status = bodyOf<WorldStatus>(imported);
    expect(status.active?.name).toBe("Testwelt");
    expect(status.active?.startMap).toBe("kirche");
    expect(status.active?.maps.map((map) => map.id).sort()).toEqual(["garten", "kirche", "saal"]);
    expect(status.active?.hasDoor).toBe(true);
    expect(status.previous).toBeNull();

    const player = await signIn(ctx, "gast", ["vip"]);
    const world = await ctx.app.inject({ url: "/api/world", headers: player });
    expect(world.statusCode).toBe(200);
    const body = bodyOf<PublicWorld>(world);
    expect(body.version).toBe(status.active?.importId);
    expect(body.avatar.parts.body.options[0]?.id).toBe("base");
    expect(body.maps).toHaveLength(3);
  });

  it("[MAP-05] the admin status lists each map with its clickable objects and portals", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const status = bodyOf<WorldStatus>(await upload(ctx, admin, buildTestWorld()));
    expect(status.active?.maps).toEqual([
      { id: "garten", name: "Garten", clickable: 2, portals: 2 },
      { id: "kirche", name: "Kirche", clickable: 4, portals: 1 },
      { id: "saal", name: "Saal", clickable: 1, portals: 1 },
    ]);
  });

  it("[MAP-05] without an imported world the players' world is null", async () => {
    context = await createTestApp();
    context.event.setSetting("platformOpen", true, "cli");
    const player = await signIn(context, "gast", ["vip"]);
    const world = await context.app.inject({ url: "/api/world", headers: player });
    expect(world.statusCode).toBe(200);
    expect(world.json()).toBeNull();
  });

  it("[MAP-06] a refused package is answered with its findings; the active world and its folder stay", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, namedWorld("Sommerfest"));
    const broken = testWorldFiles();
    broken["maps/garten.json"] = Buffer.from("{");
    const refused = await upload(ctx, admin, buildArchive(broken));
    expect(refused.statusCode).toBe(422);
    const body: { error: { code: string }; findings: { code: string }[] } = refused.json();
    expect(body.error.code).toBe("world_refused");
    expect(body.findings.map((finding) => finding.code)).toContain("json_invalid");
    const status = bodyOf<WorldStatus>(
      await ctx.app.inject({ url: "/api/admin/world", headers: admin }),
    );
    expect(status.active?.name).toBe("Sommerfest");
    expect(worldFolders(ctx)).toHaveLength(1);
  });

  it("[MAP-08] an accepted world lists its preset warnings: missing pages, dialogues and minigames", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const imported = await upload(ctx, admin, buildTestWorld());
    expect(imported.statusCode).toBe(200);
    const warnings = bodyOf<WorldStatus>(imported).active?.warnings ?? [];
    const codes = warnings.map((warning) => `${warning.code}:${warning.object ?? ""}`);
    // "spiel" starts a minigame, which does not exist before stage 8.
    expect(codes).toContain("preset_minigame:spiel");
    // "schild" and "sprecher" show the content page "anreise", which the installation does not have.
    expect(codes).toContain("preset_missing:schild");
    expect(codes).toContain("preset_missing:sprecher");
    // "pastor" opens the dialogue "npc-pastor"; dialogues come with stage 5g.
    expect(codes).toContain("preset_missing:pastor");
    // "altar" opens the built-in programme: no warning.
    expect(codes).not.toContain("preset_missing:altar");
    expect(warnings.every((warning) => warning.severity === "warning")).toBe(true);
  });

  it("[MAP-08] a page that the installation has creates no warning", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const page = await ctx.app.inject({
      method: "POST",
      url: "/api/content/pages",
      headers: admin,
      payload: { slug: "anreise", title: "Anreise", markdown: "Hallo", inMore: true },
    });
    expect(page.statusCode).toBe(200);
    const imported = await upload(ctx, admin, buildTestWorld());
    const codes = bodyOf<WorldStatus>(imported).active?.warnings.map((warning) => warning.object);
    expect(codes).not.toContain("schild");
    expect(codes).not.toContain("sprecher");
  });

  it("[MAP-09] a second import keeps the first as the previous world; a rollback makes it active again", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const first = bodyOf<WorldStatus>(await upload(ctx, admin, namedWorld("Erste"))).active;
    const second = bodyOf<WorldStatus>(await upload(ctx, admin, namedWorld("Zweite")));
    expect(second.active?.name).toBe("Zweite");
    expect(second.previous?.name).toBe("Erste");

    const rolled = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/world/rollback",
      headers: admin,
    });
    expect(rolled.statusCode).toBe(200);
    const status = bodyOf<WorldStatus>(rolled);
    expect(status.active?.name).toBe("Erste");
    expect(status.active?.importId).toBe(first?.importId);
    expect(status.previous?.name).toBe("Zweite");
    expect(worldFolders(ctx)).toHaveLength(2);
  });

  it("[MAP-09] the world before the previous one is removed by the next import", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, namedWorld("Erste"));
    await upload(ctx, admin, namedWorld("Zweite"));
    const third = bodyOf<WorldStatus>(await upload(ctx, admin, namedWorld("Dritte")));
    expect(third.previous?.name).toBe("Zweite");
    expect(worldFolders(ctx)).toHaveLength(2);
  });

  it("[MAP-09] a rollback without a previous world is refused with 409", async () => {
    context = await createTestApp();
    const admin = await signIn(context, "boss", ["admin"]);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/world/rollback",
      headers: admin,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "no_previous_world" } });
  });

  it("[MAP-10] the maps, tileset images and avatar sprites are served under the import id, cached for a year", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const status = bodyOf<WorldStatus>(await upload(ctx, admin, buildTestWorld()));
    const id = status.active?.importId ?? "";
    const player = await signIn(ctx, "gast", ["vip"]);

    const map = await ctx.app.inject({ url: `/api/world/${id}/maps/kirche.json`, headers: player });
    expect(map.statusCode).toBe(200);
    expect(map.headers["content-type"]).toContain("application/json");
    expect(map.headers["cache-control"]).toContain("immutable");
    expect(map.json()).toMatchObject({ orientation: "orthogonal" });

    const tileset = await ctx.app.inject({
      url: `/api/world/${id}/tilesets/boden.png`,
      headers: player,
    });
    expect(tileset.statusCode).toBe(200);
    expect(tileset.headers["content-type"]).toBe("image/png");

    const sprite = await ctx.app.inject({
      url: `/api/world/${id}/avatar/body.png`,
      headers: player,
    });
    expect(sprite.statusCode).toBe(200);
  });

  it("[MAP-10] nothing else of a world is served: the door folder, the manifest, other import ids", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const status = bodyOf<WorldStatus>(await upload(ctx, admin, buildTestWorld()));
    const id = status.active?.importId ?? "";
    const player = await signIn(ctx, "gast", ["vip"]);
    for (const url of [
      `/api/world/${id}/door/door.png`,
      `/api/world/${id}/manifest.json`,
      `/api/world/${id}/tilesets/../manifest.json`,
      `/api/world/00000000-0000-0000-0000-000000000000/maps/kirche.json`,
    ]) {
      const response = await ctx.app.inject({ url, headers: player });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it("[ACS-07] a world is served to signed-in guests of an open platform only", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    const player = await signIn(ctx, "gast", ["vip"]);

    // Closed: a guest is refused, staff and admins still reach the world.
    expect((await ctx.app.inject({ url: "/api/world", headers: player })).json()).toMatchObject({
      error: { code: "platform_closed" },
    });
    expect((await ctx.app.inject({ url: "/api/world", headers: admin })).statusCode).toBe(200);

    ctx.event.setSetting("platformOpen", true, "cli");
    expect((await ctx.app.inject({ url: "/api/world", headers: player })).statusCode).toBe(200);
  });

  it("[ACS-07] a signed-out visitor gets no world at all", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    expect((await ctx.app.inject({ url: "/api/world" })).statusCode).toBe(401);
  });

  it("[MAP-05] only admins import and roll back a world", async () => {
    context = await createTestApp();
    const ctx = context;
    const staff = await signIn(ctx, "redakteur", ["staff"]);
    const imported = await upload(ctx, staff, buildTestWorld());
    expect(imported.statusCode).toBe(403);
    const rolled = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/world/rollback",
      headers: staff,
    });
    expect(rolled.statusCode).toBe(403);
  });

  it("[MAP-04] imports and rollbacks are audited", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, namedWorld("Erste"));
    await upload(ctx, admin, namedWorld("Zweite"));
    await ctx.app.inject({ method: "POST", url: "/api/admin/world/rollback", headers: admin });
    const actions = ctx.event.auditEntries().map((entry) => entry.action);
    expect(actions).toContain("world.import");
    expect(actions).toContain("world.rollback");
  });

  it("[ACS-12] the waiting page takes its door scene from the active world; a world without one gives the default", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const player = await signIn(ctx, "gast", ["vip"]);

    await upload(ctx, admin, buildTestWorld());
    const door = await ctx.app.inject({ url: "/api/waiting/door", headers: player });
    expect(door.json()).toMatchObject({ kind: "sheet", glimpse: true, sheet: { frames: 4 } });
    const sheet = await ctx.app.inject({ url: "/api/waiting/door/sheet", headers: player });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.headers["content-type"]).toBe("image/png");

    const files = Object.fromEntries(
      Object.entries(testWorldFiles()).filter(([path]) => !path.startsWith("door/")),
    );
    await upload(ctx, admin, buildArchive(files));
    const withoutDoor = await ctx.app.inject({ url: "/api/waiting/door", headers: player });
    expect(withoutDoor.json()).toMatchObject({ kind: "default" });
  });
});
