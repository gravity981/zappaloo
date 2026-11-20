// The dialogues of the game world (CNT-02, CNT-03, CNT-08, CNT-09; sw-architecture.md 6.2, 14.4): editing, the id made
// from the figure's name, the greeting, the use by objects (a preset in Tiled or the admin's assignment), deleting only
// what no object shows, the portrait, and what the guest reads. The test world's object "pastor" of the map "kirche" has the preset
// `dialog` with the contentId "pfarrer-keller".
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
  npcName: "Pfarrer Keller",
  greeting: "Grüss Gott!",
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
  it("[CNT-02][CNT-09] a dialogue is made with the figure's name, a greeting and lines in Markdown, and read back; its id comes from the name", async () => {
    const { ctx, admin } = await setup();
    const made = await create(ctx, admin);
    expect(made.statusCode).toBe(201);
    expect(made.json<DialogueDetail>()).toMatchObject({
      id: "pfarrer-keller",
      npcName: "Pfarrer Keller",
      greeting: "Grüss Gott!",
      lines: body().lines,
      portrait: null,
    });
    const [item] = await list(ctx, admin);
    expect(item).toMatchObject({
      id: "pfarrer-keller",
      npcName: "Pfarrer Keller",
      greeting: "Grüss Gott!",
      lines: 2,
      portrait: false,
    });
    const read = await ctx.app.inject({
      url: "/api/admin/dialogues/pfarrer-keller",
      headers: admin,
    });
    expect(read.json<DialogueDetail>().lines).toEqual(body().lines);
  });

  it("[CNT-02][CNT-09] the name has 1–60 characters, the greeting at most 120 (and may be empty), there are 1–30 lines of at most 500 characters; the id is not sent, and a second figure of the same name gets -2", async () => {
    const { ctx, admin } = await setup();
    for (const bad of [
      { id: "pfarrer-keller" },
      { npcName: "   " },
      { npcName: "n".repeat(61) },
      { greeting: "g".repeat(121) },
      { lines: [] },
      { lines: Array.from({ length: 31 }, () => "x") },
      { lines: ["x".repeat(501)] },
      { lines: ["   "] },
    ]) {
      expect((await create(ctx, admin, body(bad))).statusCode, JSON.stringify(bad)).toBe(400);
    }
    const longest = await create(
      ctx,
      admin,
      body({ npcName: "x".repeat(60), greeting: "g".repeat(120), lines: ["x".repeat(500)] }),
    );
    expect(longest.statusCode).toBe(201);
    expect(longest.json<DialogueDetail>().id).toHaveLength(40);
    // Without a greeting there is no speech bubble: it is stored and read back as empty.
    const silent = await create(ctx, admin, body({ npcName: "Koch", greeting: "" }));
    expect(silent.json<DialogueDetail>()).toMatchObject({ id: "koch", greeting: "" });
    const first = await create(ctx, admin);
    const second = await create(ctx, admin);
    expect(first.json<DialogueDetail>().id).toBe("pfarrer-keller");
    expect(second.statusCode).toBe(201);
    expect(second.json<DialogueDetail>().id).toBe("pfarrer-keller-2");
  });

  it("[CNT-02] a dialogue is changed, and unknown ones are 404", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin);
    const changed = await update(
      ctx,
      admin,
      "pfarrer-keller",
      body({ npcName: "Pfarrerin Keller", greeting: "", lines: ["Hallo!"] }),
    );
    expect(changed.statusCode).toBe(200);
    // The id stays, whatever the name is now (CNT-09).
    expect(changed.json<DialogueDetail>()).toMatchObject({
      id: "pfarrer-keller",
      npcName: "Pfarrerin Keller",
      greeting: "",
      lines: ["Hallo!"],
    });
    expect((await update(ctx, admin, "pfarrer-keller", body({ id: "neu" }))).statusCode).toBe(400);
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
    await create(ctx, admin, body({ npcName: "Koch" }));
    await update(ctx, admin, "koch", body({ npcName: "Koch", greeting: "Servus" }));
    await remove(ctx, admin, "koch");
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
    expect(logged).toContain("koch");
    expect(logged).not.toContain("Koch");
    expect(logged).not.toContain("Servus");
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
    expect(after.dialogues).toEqual(["pfarrer-keller"]);
    expect(
      after.maps
        .find((map) => map.id === "kirche")
        ?.clickables.find((item) => item.name === "pastor")?.missing,
    ).toBe(false);
    // The admin points another object to the dialogue; an assignment that replaces the preset removes the use.
    await create(ctx, admin, body({ npcName: "Koch" }));
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
    expect(used.find((item) => item.id === "pfarrer-keller")?.usedBy).toEqual([]);
    expect(
      used
        .find((item) => item.id === "koch")
        ?.usedBy.map((use) => use.object)
        .sort(),
    ).toEqual(["altar", "pastor"]);
  });

  it("[CNT-09] the id never changes: renaming the figure keeps the id, the assignments and the preset that names it", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin, body({ npcName: "Koch" }));
    await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/world/objects/kirche/altar",
      headers: admin,
      payload: { action: { kind: "dialog", dialogId: "koch" } },
    });
    expect((await update(ctx, admin, "koch", body({ npcName: "Küchenchef" }))).statusCode).toBe(
      200,
    );
    const altar = (await worldObjects(ctx, admin)).maps
      .find((map) => map.id === "kirche")
      ?.clickables.find((item) => item.name === "altar");
    expect(altar?.override).toEqual({ kind: "dialog", dialogId: "koch" });
    expect(altar?.missing).toBe(false);
    // The preset of "pastor" names pfarrer-keller: missing until a dialogue with that id exists, and it stays valid
    // when its figure is renamed.
    const preset = async () =>
      (await worldObjects(ctx, admin)).maps
        .find((map) => map.id === "kirche")
        ?.clickables.find((item) => item.name === "pastor")?.missing;
    expect(await preset()).toBe(true);
    await create(ctx, admin);
    expect(await preset()).toBe(false);
    await update(ctx, admin, "pfarrer-keller", body({ npcName: "Pfarrerin Keller" }));
    expect(await preset()).toBe(false);
  });

  it("[CNT-03] a dialogue that an object shows cannot be deleted, and the message names the objects; an unused one can", async () => {
    const { ctx, admin } = await setup();
    await create(ctx, admin);
    await create(ctx, admin, body({ npcName: "Koch" }));
    const refused = await remove(ctx, admin, "pfarrer-keller");
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ error: { code: string }; used: { object: string }[] }>()).toMatchObject({
      error: { code: "dialogue_in_use" },
      used: [{ object: "pastor" }],
    });
    expect((await list(ctx, admin)).map((item) => item.id)).toContain("pfarrer-keller");
    expect((await remove(ctx, admin, "koch")).statusCode).toBe(204);
    expect((await remove(ctx, admin, "koch")).statusCode).toBe(404);
  });
});

describe("the portrait (CNT-08)", () => {
  it("[CNT-08] a portrait is kept as uploaded, shown by its version, and can be removed", async () => {
    const { ctx, admin, guest } = await setup();
    await create(ctx, admin);
    const bytes = await portrait(64, 64);
    const set = await uploadPortrait(ctx, admin, "pfarrer-keller", bytes, "image/png");
    expect(set.statusCode).toBe(200);
    const version = set.json<DialogueDetail>().portrait;
    expect(version).toEqual(expect.any(Number));
    // The guest gets the very bytes the admin uploaded: pixel art is not changed.
    const served = await ctx.app.inject({
      url: `/api/dialogues/pfarrer-keller/portrait?v=${String(version)}`,
      headers: guest,
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.rawPayload.equals(bytes)).toBe(true);
    expect((await list(ctx, admin))[0]?.portrait).toBe(true);
    const gone = await ctx.app.inject({
      method: "DELETE",
      url: "/api/admin/dialogues/pfarrer-keller/portrait",
      headers: admin,
    });
    expect(gone.json<DialogueDetail>().portrait).toBeNull();
    expect(
      (await ctx.app.inject({ url: "/api/dialogues/pfarrer-keller/portrait", headers: guest }))
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
          "pfarrer-keller",
          await portrait(512, 512, "jpeg"),
          "image/jpeg",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await uploadPortrait(ctx, admin, "pfarrer-keller", await portrait(513, 100), "image/png"))
        .statusCode,
    ).toBe(413);
    expect(
      (await uploadPortrait(ctx, admin, "pfarrer-keller", await portrait(100, 513), "image/png"))
        .statusCode,
    ).toBe(413);
    expect(
      (
        await uploadPortrait(
          ctx,
          admin,
          "pfarrer-keller",
          Buffer.alloc(1024 * 1024 + 1, 1),
          "image/png",
        )
      ).statusCode,
    ).toBe(413);
    expect(
      (await uploadPortrait(ctx, admin, "pfarrer-keller", Buffer.from("hallo"), "image/png"))
        .statusCode,
    ).toBe(415);
    const damaged = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("kaputt"),
    ]);
    expect(
      (await uploadPortrait(ctx, admin, "pfarrer-keller", damaged, "image/png")).statusCode,
    ).toBe(422);
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
    await uploadPortrait(ctx, admin, "pfarrer-keller", await portrait(32, 32), "image/png");
    const read = await ctx.app.inject({ url: "/api/dialogues/pfarrer-keller", headers: guest });
    expect(read.statusCode).toBe(200);
    expect(read.json<DialogueGuest>()).toMatchObject({
      id: "pfarrer-keller",
      npcName: "Pfarrer Keller",
      lines: body().lines,
      portrait: expect.any(Number) as number,
    });
    expect(JSON.stringify(read.json())).not.toContain("usedBy");
    expect(
      (await ctx.app.inject({ url: "/api/dialogues/gibt-es-nicht", headers: guest })).statusCode,
    ).toBe(404);
    expect((await ctx.app.inject({ url: "/api/dialogues/pfarrer-keller" })).statusCode).toBe(401);
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
    const refused = await ctx.app.inject({ url: "/api/dialogues/pfarrer-keller", headers: guest });
    expect(refused.statusCode).toBe(403);
    expect(
      (await ctx.app.inject({ url: "/api/dialogues/pfarrer-keller", headers: admin })).statusCode,
    ).toBe(200);
  });
});
