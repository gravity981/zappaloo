import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicWorld, WorldObjects, WorldStatus } from "@zappaloo/shared";
import { buildArchive } from "../packages/build.ts";
import { buildTestWorld, testWorldFiles } from "../world/build.ts";
import { WorldService } from "../world/service.ts";
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
      formatVersion: 3,
      name,
      startMap: "kirche",
      tileWidth: 64,
      tileHeight: 32,
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
    expect(body.figures.map((figure) => figure.id)).toEqual([
      "wedding-guest",
      "male-guest",
      "kid",
      "crew",
      "pastor",
    ]);
    expect(body.tileWidth).toBe(64);
    expect(body.tileHeight).toBe(32);
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
    // "pastor" opens the dialogue "npc-pastor", which the installation does not have (the admin makes dialogues in 6d).
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
    expect(map.json()).toMatchObject({ orientation: "isometric" });

    const tileset = await ctx.app.inject({
      url: `/api/world/${id}/tilesets/boden.png`,
      headers: player,
    });
    expect(tileset.statusCode).toBe(200);
    expect(tileset.headers["content-type"]).toBe("image/png");

    // A figure: its metadata and its frames, in the folder of the figure (AVA-01, AVA-02).
    const figures = await ctx.app.inject({
      url: `/api/world/${id}/avatar/figures.json`,
      headers: player,
    });
    expect(figures.statusCode).toBe(200);
    const metadata = await ctx.app.inject({
      url: `/api/world/${id}/avatar/wedding-guest/metadata.json`,
      headers: player,
    });
    expect(metadata.statusCode).toBe(200);
    const frame = await ctx.app.inject({
      url: `/api/world/${id}/avatar/wedding-guest/Idle/rotations/south.png`,
      headers: player,
    });
    expect(frame.statusCode).toBe(200);
    expect(frame.headers["content-type"]).toBe("image/png");
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

  it("[ACS-07][MAP-10] the world file route does not leave the world's folder: encoded `..` segments answer 404", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const status = bodyOf<WorldStatus>(await upload(ctx, admin, buildTestWorld()));
    const id = status.active?.importId ?? "";
    const player = await signIn(ctx, "gast", ["vip"]);
    // The manifest exists in the world's folder, so the requests below would read it without the guard.
    expect(
      existsSync(join(ctx.paths.events, ctx.event.eventId, "world", id, "manifest.json")),
    ).toBe(true);
    for (const url of [
      `/api/world/${id}/avatar/..%2F..%2F${id}%2Fmanifest.json`,
      `/api/world/${id}/avatar/%2e%2e%2f%2e%2e%2f${id}%2Fmanifest.json`,
      `/api/world/${id}/avatar/..%2F..%2Fmanifest.json`,
      `/api/world/${id}/avatar/wedding-guest/..%2F..%2F..%2F${id}%2Fmanifest.json`,
    ]) {
      const response = await ctx.app.inject({ url, headers: player });
      expect(response.statusCode, url).toBe(404);
    }
    // A real figure frame is still served.
    const frame = await ctx.app.inject({
      url: `/api/world/${id}/avatar/wedding-guest/Idle/rotations/south.png`,
      headers: player,
    });
    expect(frame.statusCode).toBe(200);
  });

  it("[ACS-07][MAP-10] WorldService.file() returns nothing outside the active world's folder", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const status = bodyOf<WorldStatus>(await upload(ctx, admin, buildTestWorld()));
    const id = status.active?.importId ?? "";
    const service = new WorldService(ctx.database, ctx.event, ctx.paths.events);
    expect(service.file(id, `avatar/../../${id}/manifest.json`)).toBeUndefined();
    expect(service.file(id, "avatar/../../manifest.json")).toBeUndefined();
    expect(service.file(id, "avatar/wedding-guest/metadata.json")).toBeDefined();
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

describe("the actions of clickable objects (MAP-15, GAME-06)", () => {
  const put = (ctx: TestContext, headers: Headers, map: string, object: string, action: unknown) =>
    ctx.app.inject({
      method: "PUT",
      url: `/api/admin/world/objects/${map}/${object}`,
      headers,
      payload: { action },
    });
  const objects = async (ctx: TestContext, headers: Headers) =>
    bodyOf<WorldObjects>(await ctx.app.inject({ url: "/api/admin/world/objects", headers }));
  const world = async (ctx: TestContext, headers: Headers) =>
    bodyOf<PublicWorld>(await ctx.app.inject({ url: "/api/world", headers }));

  it("[MAP-15] the admin sees each map's clickable objects with their presets, and its portals read-only", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    const list = await objects(ctx, admin);
    const church = list.maps.find((map) => map.id === "kirche");
    const altar = church?.clickables.find((item) => item.name === "altar");
    expect(altar?.preset).toEqual({ kind: "page", page: "programme" });
    expect(altar?.missing).toBe(false);
    // The dialogue of "pastor" does not exist yet; the preset is marked as missing.
    const pastor = church?.clickables.find((item) => item.name === "pastor");
    expect(pastor).toMatchObject({
      preset: { kind: "dialog", dialogId: "npc-pastor" },
      missing: true,
    });
    expect(church?.portals.map((portal) => portal.name)).toContain("zum-garten");
    expect(list.pages).toEqual(expect.arrayContaining(["programme", "rsvp", "profile"]));
  });

  it("[MAP-15][GAME-06] an assignment replaces the preset at once, without a new import; null returns to the preset", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    ctx.event.setSetting("platformOpen", true, "cli");
    const player = await signIn(ctx, "gast", ["vip"]);
    await upload(ctx, admin, buildTestWorld());
    expect((await world(ctx, player)).actions).toEqual([]);

    const assigned = await put(ctx, admin, "kirche", "altar", { kind: "page", page: "profile" });
    expect(assigned.statusCode).toBe(200);
    expect((await world(ctx, player)).actions).toEqual([
      { map: "kirche", object: "altar", action: { kind: "page", page: "profile" } },
    ]);
    const altar = (await objects(ctx, admin)).maps
      .find((map) => map.id === "kirche")
      ?.clickables.find((item) => item.name === "altar");
    expect(altar).toMatchObject({
      preset: { kind: "page", page: "programme" },
      override: { kind: "page", page: "profile" },
    });

    await put(ctx, admin, "kirche", "altar", { kind: "none" });
    expect((await world(ctx, player)).actions[0]?.action).toEqual({ kind: "none" });
    await put(ctx, admin, "kirche", "altar", null);
    expect((await world(ctx, player)).actions).toEqual([]);
    // Ids only in the audit log.
    const entry = ctx.event.auditEntries().find((item) => item.action === "world.action");
    expect(entry?.details).toEqual({ map: "kirche", object: "altar" });
  });

  it("[MAP-15][CNT-03] any content page can be linked to a clickable object: a content preset is the page p/<slug>, and the admin picks it from the pages", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    const sign = async () =>
      (await objects(ctx, admin)).maps
        .find((map) => map.id === "kirche")
        ?.clickables.find((item) => item.name === "schild");
    // "schild" has the preset action content with contentId anreise: the page p/anreise, which does not exist yet.
    expect(await sign()).toMatchObject({
      preset: { kind: "page", page: "p/anreise" },
      missing: true,
    });
    const page = await ctx.app.inject({
      method: "POST",
      url: "/api/content/pages",
      headers: admin,
      payload: { slug: "anreise", title: "Anreise", markdown: "Hallo", inMore: true },
    });
    expect(page.statusCode).toBe(200);
    expect(await sign()).toMatchObject({ missing: false });
    expect((await objects(ctx, admin)).pages).toContain("p/anreise");
    // The admin links another content page to another object, as with every page.
    expect(
      (await put(ctx, admin, "kirche", "altar", { kind: "page", page: "p/anreise" })).statusCode,
    ).toBe(200);
  });

  it("[MAP-15] an assignment names an existing object and an existing target; a minigame cannot be assigned; only admins assign", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const player = await signIn(ctx, "gast", ["vip"]);
    await upload(ctx, admin, buildTestWorld());
    expect((await put(ctx, admin, "kirche", "gibt-es-nicht", { kind: "none" })).statusCode).toBe(
      404,
    );
    expect(
      (await put(ctx, admin, "kirche", "altar", { kind: "page", page: "p/fehlt" })).statusCode,
    ).toBe(422);
    // A content page is a page: there is no separate action for it.
    expect(
      (await put(ctx, admin, "kirche", "altar", { kind: "content", contentId: "anreise" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put(ctx, admin, "kirche", "altar", { kind: "minigame", minigameId: "quiz" }))
        .statusCode,
    ).toBe(400);
    expect((await put(ctx, player, "kirche", "altar", { kind: "none" })).statusCode).toBe(403);
    expect(
      (await ctx.app.inject({ url: "/api/admin/world/objects", headers: player })).statusCode,
    ).toBe(403);
  });

  /** The example world as a package without its easter egg `osterei` (the object of a later import is gone). */
  const worldWithoutOsterei = (): Buffer => {
    const files = testWorldFiles();
    interface Layer {
      objects?: { name: string }[];
      layers?: Layer[];
    }
    const map = JSON.parse(files["maps/kirche.json"]?.toString("utf8") ?? "{}") as {
      layers: Layer[];
    };
    const drop = (layers: Layer[]): void => {
      for (const layer of layers) {
        if (layer.objects) layer.objects = layer.objects.filter((item) => item.name !== "osterei");
        if (layer.layers) drop(layer.layers);
      }
    };
    drop(map.layers);
    files["maps/kirche.json"] = Buffer.from(JSON.stringify(map));
    return buildArchive(files);
  };

  it("[MAP-15] a new import keeps the assignments of objects that still exist, and lists those of objects that are gone as unmatched", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    await put(ctx, admin, "kirche", "altar", { kind: "page", page: "profile" });
    await put(ctx, admin, "kirche", "osterei", { kind: "none" });

    const imported = await upload(ctx, admin, worldWithoutOsterei());
    expect(imported.statusCode).toBe(200);
    const warnings = bodyOf<WorldStatus>(imported).active?.warnings ?? [];
    expect(
      warnings.filter((item) => item.code === "action_unmatched").map((item) => item.object),
    ).toEqual(["osterei"]);
    expect((await world(ctx, admin)).actions.map((item) => item.object)).toEqual(["altar"]);
  });

  it("[MAP-09][MAP-15] the assignment of an object that a new import lacks applies again after a rollback", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    await put(ctx, admin, "kirche", "osterei", { kind: "page", page: "profile" });
    await upload(ctx, admin, worldWithoutOsterei());
    expect((await world(ctx, admin)).actions.map((item) => item.object)).toEqual([]);

    const rolled = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/world/rollback",
      headers: admin,
    });
    expect(rolled.statusCode).toBe(200);
    expect((await world(ctx, admin)).actions.map((item) => item.object)).toEqual(["osterei"]);
  });

  it("[MAP-15] the assignment of a missing object applies again when a later package has the object", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    await put(ctx, admin, "kirche", "osterei", { kind: "page", page: "profile" });
    await upload(ctx, admin, worldWithoutOsterei());
    const back = await upload(ctx, admin, buildTestWorld());
    expect(
      (bodyOf<WorldStatus>(back).active?.warnings ?? []).filter(
        (item) => item.code === "action_unmatched",
      ),
    ).toEqual([]);
    expect((await world(ctx, admin)).actions.map((item) => item.object)).toEqual(["osterei"]);
  });

  it("[MAP-09] an import started while a rollback runs leaves the folders of both worlds intact", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    await upload(ctx, admin, worldWithoutOsterei());
    // Both start without waiting for each other. Whichever runs first, the import must not remove the folder that
    // the rollback or the import leaves active or previous: two folders remain, and the active one is served.
    const rollback = ctx.app.inject({
      method: "POST",
      url: "/api/admin/world/rollback",
      headers: admin,
    });
    const imported = upload(ctx, admin, buildTestWorld());
    const [rolled, done] = await Promise.all([rollback, imported]);
    expect(rolled.statusCode).toBe(200);
    expect(done.statusCode).toBe(200);
    const active = bodyOf<WorldStatus>(done).active?.importId ?? "";
    expect(worldFolders(ctx)).toHaveLength(2);
    expect(worldFolders(ctx)).toContain(active);
    const status = await ctx.app.inject({ url: "/api/world", headers: admin });
    expect(status.statusCode).toBe(200);
  });
});

describe("guest access to the world (MAP-19)", () => {
  const setAccess = (ctx: TestContext, headers: Headers, enabled: boolean) =>
    ctx.app.inject({
      method: "PUT",
      url: "/api/admin/world/guest-access",
      headers,
      payload: { enabled },
    });

  it("[MAP-19] the first successful import switches guest access on, and a refused package does not", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const before = await ctx.app.inject({ url: "/api/admin/world", headers: admin });
    expect(bodyOf<WorldStatus>(before).guestAccess).toBe(false);
    await upload(ctx, admin, Buffer.from("not a package"));
    expect(
      bodyOf<WorldStatus>(await ctx.app.inject({ url: "/api/admin/world", headers: admin }))
        .guestAccess,
    ).toBe(false);
    const imported = await upload(ctx, admin, buildTestWorld());
    expect(bodyOf<WorldStatus>(imported).guestAccess).toBe(true);
    const guest = await signIn(ctx, "gast", ["vip"]);
    expect((await ctx.app.inject({ url: "/api/world", headers: guest })).statusCode).toBe(200);
  });

  it("[MAP-19] switched off, guests get 403 for the world, its files and the avatar routes; the world stays, and staff and admins still reach it", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const imported = await upload(ctx, admin, buildTestWorld());
    const importId = bodyOf<WorldStatus>(imported).active?.importId ?? "";
    const guest = await signIn(ctx, "gast", ["vip"]);
    const staff = await signIn(ctx, "redakteur", ["staff"]);

    const off = await setAccess(ctx, admin, false);
    expect(off.statusCode).toBe(200);
    expect(bodyOf<WorldStatus>(off).guestAccess).toBe(false);
    expect(bodyOf<WorldStatus>(off).active?.importId).toBe(importId);

    for (const url of ["/api/world", `/api/world/${importId}/maps/kirche.json`, "/api/avatar"]) {
      const refused = await ctx.app.inject({ url, headers: guest });
      expect(refused.statusCode, url).toBe(403);
      expect(refused.json(), url).toMatchObject({ error: { code: "world_access_disabled" } });
      expect((await ctx.app.inject({ url, headers: admin })).statusCode, url).toBe(200);
      expect((await ctx.app.inject({ url, headers: staff })).statusCode, url).toBe(200);
    }
    const choose = await ctx.app.inject({
      method: "PUT",
      url: "/api/avatar/me",
      headers: guest,
      payload: { figure: "kid" },
    });
    expect(choose.statusCode).toBe(403);
    expect(choose.json()).toMatchObject({ error: { code: "world_access_disabled" } });
  });

  it("[MAP-19] turning access back on needs no new import, and a new import keeps the switch where the admin left it", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    const guest = await signIn(ctx, "gast", ["vip"]);
    await setAccess(ctx, admin, false);
    // A new import does not switch it on again.
    await upload(ctx, admin, namedWorld("Zweite"));
    expect((await ctx.app.inject({ url: "/api/world", headers: guest })).statusCode).toBe(403);
    // Turning it on needs no import.
    expect(bodyOf<WorldStatus>(await setAccess(ctx, admin, true)).guestAccess).toBe(true);
    const world = await ctx.app.inject({ url: "/api/world", headers: guest });
    expect(bodyOf<PublicWorld>(world).name).toBe("Zweite");
  });

  it("[MAP-19] only admins switch guest access, and the switch is audited", async () => {
    context = await createTestApp();
    const ctx = context;
    const staff = await signIn(ctx, "redakteur", ["staff"]);
    expect((await setAccess(ctx, staff, false)).statusCode).toBe(403);
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildTestWorld());
    await setAccess(ctx, admin, false);
    expect(ctx.event.auditEntries().map((entry) => entry.action)).toContain("world.guest_access");
  });
});
