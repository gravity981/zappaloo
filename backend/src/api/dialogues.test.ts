// The dialogues of the game world (CNT-02, CNT-03, CNT-08; sw-architecture.md 6.2, 14.4): editing, the use by objects
// (a preset in Tiled or the admin's assignment), a new id that keeps the assignments, deleting only what no object
// shows, the portrait, and what the guest reads. The test world's object "pastor" of the map "kirche" has the preset
// `dialog` with the contentId "npc-pastor".
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DialogueDetail,
  DialogueGuest,
  DialoguesResponse,
  WorldObjects,
} from "@zappaloo/shared";
import { auditLog } from "../database/schema.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { buildTestWorld } from "../world/build.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;

async function setup(withWorld = true) {
  const ctx = await createTestApp();
  context = ctx;
  ctx.event.setSetting("platformOpen", true, "cli");
  const admin = await signIn(ctx, "boss", ["admin"]);
  if (withWorld) {
    const imported = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/world",
      headers: { ...admin, "content-type": "application/vnd.zappaloo.world" },
      payload: buildTestWorld(),
    });
    expect(imported.statusCode).toBe(200);
  }
  const guest = await signIn(ctx, "gast", ["vip"]);
  return { ctx, admin, guest };
}

const body = (changes: Record<string, unknown> = {}) => ({
  id: "npc-pastor",
  npcName: "Pfarrer Keller",
  lines: ["Grüss Gott! Schön, dass du da bist.", "Die Trauung beginnt um **14:00**."],
  ...changes,
});

const create = (ctx: TestContext, admin: Headers, payload: Record<string, unknown> = body()) =>
  ctx.app.inject({ method: "POST", url: "/api/admin/dialogues", headers: admin, payload });

const update = (ctx: TestContext, admin: Headers, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: "PUT", url: `/api/admin/dialogues/${id}`, headers: admin, payload });

const remove = (ctx: TestContext, admin: Headers, id: string) =>
  ctx.app.inject({ method: "DELETE", url: `/api/admin/dialogues/${id}`, headers: admin });

const list = async (ctx: TestContext, admin: Headers) =>
  (await ctx.app.inject({ url: "/api/admin/dialogues", headers: admin })).json<DialoguesResponse>()
    .dialogues;

const worldObjects = async (ctx: TestContext, admin: Headers) =>
  (await ctx.app.inject({ url: "/api/admin/world/objects", headers: admin })).json<WorldObjects>();

const portrait = (width: number, height: number, format: "png" | "jpeg" = "png") =>
  sharp({ create: { width, height, channels: 3, background: "#369" } })
    [format]()
    .toBuffer();

const uploadPortrait = (
  ctx: TestContext,
  admin: Headers,
  id: string,
  bytes: Buffer,
  type: string,
) =>
  ctx.app.inject({
    method: "PUT",
    url: `/api/admin/dialogues/${id}/portrait`,
    headers: { ...admin, "content-type": type },
    payload: bytes,
  });

describe("editing dialogues (CNT-02)", () => {
  it("[CNT-02] a dialogue is made with an id, the NPC's name and lines in Markdown, and read back", async () => {
    const { ctx, admin } = await setup();
    const made = await create(ctx, admin);
    expect(made.statusCode).toBe(201);
    expect(made.json<DialogueDetail>()).toMatchObject({
      id: "npc-pastor",
      npcName: "Pfarrer Keller",
      lines: body().lines,
      portrait: null,
    });
    const [item] = await list(ctx, admin);
    expect(item).toMatchObject({
      id: "npc-pastor",
      npcName: "Pfarrer Keller",
      lines: 2,
      portrait: false,
    });
    const read = await ctx.app.inject({ url: "/api/admin/dialogues/npc-pastor", headers: admin });
    expect(read.json<DialogueDetail>().lines).toEqual(body().lines);
  });

  it("[CNT-02] the id has 1–40 characters of a–z, 0–9 and -, the name 1–60, there are 1–30 lines of at most 500 characters, and an id exists once", async () => {
    const { ctx, admin } = await setup();
    for (const bad of [
      { id: "" },
      { id: "Pfarrer" },
      { id: "pf arrer" },
      { id: "x".repeat(41) },
      { npcName: "   " },
      { npcName: "n".repeat(61) },
      { lines: [] },
      { lines: Array.from({ length: 31 }, () => "x") },
      { lines: ["x".repeat(501)] },
      { lines: ["   "] },
    ]) {
      expect((await create(ctx, admin, body(bad))).statusCode).toBe(400);
    }
    expect(
      (await create(ctx, admin, body({ id: "x".repeat(40), lines: ["x".repeat(500)] }))).statusCode,
    ).toBe(201);
    await create(ctx, admin);
    const twice = await create(ctx, admin);
    expect(twice.statusCode).toBe(409);
    expect(twice.json<{ error: { code: string } }>().error.code).toBe("dialogue_exists");
  });

  it("[CNT-02] a dialogue is changed, and unknown ones are 404", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin);
    const changed = await update(
      ctx,
      admin,
      "npc-pastor",
      body({ npcName: "Pfarrerin Keller", lines: ["Hallo!"] }),
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json<DialogueDetail>()).toMatchObject({
      npcName: "Pfarrerin Keller",
      lines: ["Hallo!"],
    });
    expect((await update(ctx, admin, "gibt-es-nicht", body())).statusCode).toBe(404);
    expect(
      (await ctx.app.inject({ url: "/api/admin/dialogues/gibt-es-nicht", headers: admin }))
        .statusCode,
    ).toBe(404);
  });

  it("[CNT-02] only admins edit dialogues, and every change is audited with ids only", async () => {
    const { ctx, admin, guest } = await setup();
    expect((await create(ctx, guest)).statusCode).toBe(403);
    expect((await ctx.app.inject({ url: "/api/admin/dialogues", headers: guest })).statusCode).toBe(
      403,
    );
    expect((await ctx.app.inject({ url: "/api/admin/dialogues" })).statusCode).toBe(401);
    await create(ctx, admin);
    await update(ctx, admin, "npc-pastor", body({ id: "pfarrer" }));
    await remove(ctx, admin, "pfarrer");
    const entries = ctx.database.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action.startsWith("dialogue."));
    expect(entries.map((row) => row.action)).toEqual([
      "dialogue.create",
      "dialogue.update",
      "dialogue.delete",
    ]);
    const logged = entries.map((row) => row.details).join("");
    expect(logged).not.toContain("Keller");
    expect(logged).not.toContain("Grüss");
  });
});

describe("dialogues and the objects that show them (CNT-03, GAME-06)", () => {
  it("[CNT-03] a dialogue shows which objects use it: by a Tiled preset or by the admin's assignment; the preset stops being missing", async () => {
    const { ctx, admin } = await setup();
    const before = (await worldObjects(ctx, admin)).maps
      .find((map) => map.id === "kirche")
      ?.clickables.find((item) => item.name === "pastor");
    expect(before?.missing).toBe(true);
    const made = await create(ctx, admin);
    expect(made.json<DialogueDetail>().usedBy).toEqual([
      {
        map: "kirche",
        mapName: expect.any(String) as string | null,
        object: "pastor",
        label: "Pfarrer",
      },
    ]);
    const after = await worldObjects(ctx, admin);
    expect(after.dialogues).toEqual(["npc-pastor"]);
    expect(
      after.maps
        .find((map) => map.id === "kirche")
        ?.clickables.find((item) => item.name === "pastor")?.missing,
    ).toBe(false);
    // The admin points another object to the dialogue; an assignment that replaces the preset removes the use.
    await create(ctx, admin, body({ id: "koch", npcName: "Koch" }));
    await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/world/objects/kirche/altar",
      headers: admin,
      payload: { action: { kind: "dialog", dialogId: "koch" } },
    });
    expect(
      (await list(ctx, admin)).find((item) => item.id === "koch")?.usedBy.map((use) => use.object),
    ).toEqual(["altar"]);
    await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/world/objects/kirche/pastor",
      headers: admin,
      payload: { action: { kind: "dialog", dialogId: "koch" } },
    });
    const used = await list(ctx, admin);
    expect(used.find((item) => item.id === "npc-pastor")?.usedBy).toEqual([]);
    expect(
      used
        .find((item) => item.id === "koch")
        ?.usedBy.map((use) => use.object)
        .sort(),
    ).toEqual(["altar", "pastor"]);
  });

  it("[CNT-03] a new id keeps the admin's assignments; a preset in Tiled that names the old id points to nothing", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin, body({ id: "koch", npcName: "Koch" }));
    await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/world/objects/kirche/altar",
      headers: admin,
      payload: { action: { kind: "dialog", dialogId: "koch" } },
    });
    expect(
      (await update(ctx, admin, "koch", body({ id: "chef", npcName: "Koch" }))).statusCode,
    ).toBe(200);
    const altar = (await worldObjects(ctx, admin)).maps
      .find((map) => map.id === "kirche")
      ?.clickables.find((item) => item.name === "altar");
    expect(altar?.override).toEqual({ kind: "dialog", dialogId: "chef" });
    expect(altar?.missing).toBe(false);
    // The old id is gone; renaming onto an id that exists is refused.
    expect(
      (await ctx.app.inject({ url: "/api/admin/dialogues/koch", headers: admin })).statusCode,
    ).toBe(404);
    await create(ctx, admin);
    const clash = await update(ctx, admin, "chef", body({ id: "npc-pastor", npcName: "Koch" }));
    expect(clash.statusCode).toBe(409);
    // The preset of "pastor" names npc-pastor, which exists again: no longer missing; rename it away and it is.
    await update(ctx, admin, "npc-pastor", body({ id: "pfarrer" }));
    const pastor = (await worldObjects(ctx, admin)).maps
      .find((map) => map.id === "kirche")
      ?.clickables.find((item) => item.name === "pastor");
    expect(pastor?.missing).toBe(true);
  });

  it("[CNT-03] a dialogue that an object shows cannot be deleted, and the message names the objects; an unused one can", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin);
    await create(ctx, admin, body({ id: "koch", npcName: "Koch" }));
    const refused = await remove(ctx, admin, "npc-pastor");
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ error: { code: string }; used: { object: string }[] }>()).toMatchObject({
      error: { code: "dialogue_in_use" },
      used: [{ object: "pastor" }],
    });
    expect((await list(ctx, admin)).map((item) => item.id)).toContain("npc-pastor");
    expect((await remove(ctx, admin, "koch")).statusCode).toBe(204);
    expect((await remove(ctx, admin, "koch")).statusCode).toBe(404);
  });
});

describe("the portrait (CNT-08)", () => {
  it("[CNT-08] a portrait is kept as uploaded, shown by its version, and can be removed", async () => {
    const { ctx, admin, guest } = await setup();
    await create(ctx, admin);
    const bytes = await portrait(64, 64);
    const set = await uploadPortrait(ctx, admin, "npc-pastor", bytes, "image/png");
    expect(set.statusCode).toBe(200);
    const version = set.json<DialogueDetail>().portrait;
    expect(version).toEqual(expect.any(Number));
    // The guest gets the very bytes the admin uploaded: pixel art is not changed.
    const served = await ctx.app.inject({
      url: `/api/dialogues/npc-pastor/portrait?v=${String(version)}`,
      headers: guest,
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.rawPayload.equals(bytes)).toBe(true);
    expect((await list(ctx, admin))[0]?.portrait).toBe(true);
    const gone = await ctx.app.inject({
      method: "DELETE",
      url: "/api/admin/dialogues/npc-pastor/portrait",
      headers: admin,
    });
    expect(gone.json<DialogueDetail>().portrait).toBeNull();
    expect(
      (await ctx.app.inject({ url: "/api/dialogues/npc-pastor/portrait", headers: guest }))
        .statusCode,
    ).toBe(404);
  });

  it("[CNT-08] only JPEG, PNG and WebP of at most 1 MB and 512 pixels per side are accepted", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin);
    expect(
      (
        await uploadPortrait(
          ctx,
          admin,
          "npc-pastor",
          await portrait(512, 512, "jpeg"),
          "image/jpeg",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await uploadPortrait(ctx, admin, "npc-pastor", await portrait(513, 100), "image/png"))
        .statusCode,
    ).toBe(413);
    expect(
      (await uploadPortrait(ctx, admin, "npc-pastor", await portrait(100, 513), "image/png"))
        .statusCode,
    ).toBe(413);
    expect(
      (
        await uploadPortrait(
          ctx,
          admin,
          "npc-pastor",
          Buffer.alloc(1024 * 1024 + 1, 1),
          "image/png",
        )
      ).statusCode,
    ).toBe(413);
    expect(
      (await uploadPortrait(ctx, admin, "npc-pastor", Buffer.from("hallo"), "image/png"))
        .statusCode,
    ).toBe(415);
    const damaged = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("kaputt"),
    ]);
    expect((await uploadPortrait(ctx, admin, "npc-pastor", damaged, "image/png")).statusCode).toBe(
      422,
    );
    expect(
      (await uploadPortrait(ctx, admin, "gibt-es-nicht", await portrait(8, 8), "image/png"))
        .statusCode,
    ).toBe(404);
  });
});

describe("what the game reads (CNT-02)", () => {
  it("[CNT-02] a signed-in guest reads the NPC, the lines and the portrait's version of a dialogue; unknown ones are 404", async () => {
    const { ctx, admin, guest } = await setup();
    await create(ctx, admin);
    await uploadPortrait(ctx, admin, "npc-pastor", await portrait(32, 32), "image/png");
    const read = await ctx.app.inject({ url: "/api/dialogues/npc-pastor", headers: guest });
    expect(read.statusCode).toBe(200);
    expect(read.json<DialogueGuest>()).toMatchObject({
      id: "npc-pastor",
      npcName: "Pfarrer Keller",
      lines: body().lines,
      portrait: expect.any(Number) as number,
    });
    expect(JSON.stringify(read.json())).not.toContain("usedBy");
    expect(
      (await ctx.app.inject({ url: "/api/dialogues/gibt-es-nicht", headers: guest })).statusCode,
    ).toBe(404);
    expect((await ctx.app.inject({ url: "/api/dialogues/npc-pastor" })).statusCode).toBe(401);
  });

  it("[CNT-02] with guest access to the world switched off, a guest reads no dialogue", async () => {
    const { ctx, admin, guest } = await setup();
    await create(ctx, admin);
    await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/world/guest-access",
      headers: admin,
      payload: { enabled: false },
    });
    const refused = await ctx.app.inject({ url: "/api/dialogues/npc-pastor", headers: guest });
    expect(refused.statusCode).toBe(403);
    expect(
      (await ctx.app.inject({ url: "/api/dialogues/npc-pastor", headers: admin })).statusCode,
    ).toBe(200);
  });
});
