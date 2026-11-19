// The profiles of the guests (PRES-09, PRES-13, PRES-14, PRES-15; sw-architecture.md 3.6): the text parts, the photo
// that the server shrinks and cleans, the companions' profiles, the admin's relation list and removal.
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { PROFILE_LIMITS } from "@zappaloo/shared";
import type {
  AdminProfilesResponse,
  ProfilePeopleResponse,
  RelationsResponse,
} from "@zappaloo/shared";
import { auditLog, companions, profiles } from "../database/schema.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;

async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  ctx.event.setSetting("platformOpen", true, "cli");
  const admin = await signIn(ctx, "boss", ["admin"]);
  const guest = await signIn(ctx, "gast", ["vip"]);
  return { ctx, admin, guest };
}

const idOf = async (ctx: TestContext, headers: Headers): Promise<number> =>
  (await ctx.app.inject({ url: "/api/session", headers })).json<{ user: { id: number } }>().user.id;

const people = async (ctx: TestContext, headers: Headers) =>
  (await ctx.app.inject({ url: "/api/profile/people", headers })).json<ProfilePeopleResponse>();

const save = (
  ctx: TestContext,
  headers: Headers,
  person: string,
  body: { greeting?: string | null; relation?: number | null; relationLine?: string | null },
) =>
  ctx.app.inject({
    method: "PUT",
    url: `/api/profile/people/${person}`,
    headers,
    payload: { greeting: null, relation: null, relationLine: null, ...body },
  });

const upload = (ctx: TestContext, headers: Headers, person: string, bytes: Buffer, type: string) =>
  ctx.app.inject({
    method: "PUT",
    url: `/api/profile/people/${person}/photo`,
    headers: { ...headers, "content-type": type },
    payload: bytes,
  });

/** A 400 × 200 JPEG with EXIF data, as a phone would send it. */
const phoneJpeg = () =>
  sharp({ create: { width: 400, height: 200, channels: 3, background: "#c33" } })
    .withExif({ IFD0: { Copyright: "private" } })
    .jpeg()
    .toBuffer();

function addCompanion(ctx: TestContext, hostUserId: number, name: string) {
  return ctx.database.db
    .insert(companions)
    .values({ eventId: "event1", hostUserId, name, status: "approved", createdAt: new Date() })
    .returning({ id: companions.id })
    .get().id;
}

describe("the greeting and the lines (PRES-09, PRES-13)", () => {
  it("[PRES-09][PRES-13] a person has an empty profile until it is saved; the text parts are stored, trimmed and clearable", async () => {
    const { ctx, guest } = await setup();
    const before = (await people(ctx, guest)).persons[0];
    expect(before).toMatchObject({ id: "me", greeting: null, relation: null, relationLine: null });
    const relation = (await people(ctx, guest)).relations[2]?.id ?? 0;
    const saved = await save(ctx, guest, "me", {
      greeting: "  Hi, schön dich kennenzulernen!  ",
      relation,
      relationLine: "WG-Gspänli aus Bern",
    });
    expect(saved.statusCode).toBe(200);
    expect((await people(ctx, guest)).persons[0]).toMatchObject({
      greeting: "Hi, schön dich kennenzulernen!",
      relation,
      relationLine: "WG-Gspänli aus Bern",
    });
    await save(ctx, guest, "me", { greeting: "", relation: null, relationLine: null });
    expect((await people(ctx, guest)).persons[0]).toMatchObject({
      greeting: null,
      relation: null,
      relationLine: null,
    });
  });

  it("[PRES-09][PRES-13] the greeting is at most 80 characters and the free line at most 60", async () => {
    const { ctx, guest } = await setup();
    const ok = await save(ctx, guest, "me", {
      greeting: "g".repeat(PROFILE_LIMITS.greeting),
      relationLine: "l".repeat(PROFILE_LIMITS.relationLine),
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (await save(ctx, guest, "me", { greeting: "g".repeat(PROFILE_LIMITS.greeting + 1) }))
        .statusCode,
    ).toBe(400);
    expect(
      (await save(ctx, guest, "me", { relationLine: "l".repeat(PROFILE_LIMITS.relationLine + 1) }))
        .statusCode,
    ).toBe(400);
  });

  it("[PRES-09] the guest edits their approved companions' profiles and no one else's", async () => {
    const { ctx, guest } = await setup();
    const other = await signIn(ctx, "anders", ["vip"]);
    const mia = addCompanion(ctx, await idOf(ctx, guest), "Mia");
    expect((await people(ctx, guest)).persons.map((person) => person.name)).toEqual([
      "gast",
      "Mia",
    ]);
    expect((await save(ctx, guest, String(mia), { greeting: "Hallo!" })).statusCode).toBe(200);
    expect((await people(ctx, guest)).persons[1]?.greeting).toBe("Hallo!");
    // The profile of the guest is not changed by it, and another guest cannot reach Mia.
    expect((await people(ctx, guest)).persons[0]?.greeting).toBeNull();
    expect((await save(ctx, other, String(mia), { greeting: "Nein" })).statusCode).toBe(404);
  });

  it("[PRES-09] a profile needs a signed-in user", async () => {
    const { ctx } = await setup();
    expect((await ctx.app.inject({ url: "/api/profile/people" })).statusCode).toBe(401);
  });
});

describe("the photo (PRES-09)", () => {
  it("[PRES-09] the server makes a small square WebP of an upload and removes its metadata", async () => {
    const { ctx, guest } = await setup();
    const response = await upload(ctx, guest, "me", await phoneJpeg(), "image/jpeg");
    expect(response.statusCode).toBe(200);
    const version = response.json<ProfilePeopleResponse>().persons[0]?.photo;
    expect(version).toEqual(expect.any(Number));
    // The page asks for the picture with its version in the address (cache busting), as the browser does.
    const served = await ctx.app.inject({
      url: `/api/profile/people/me/photo?v=${String(version)}`,
      headers: guest,
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    const info = await sharp(served.rawPayload).metadata();
    expect(info).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(info.exif).toBeUndefined();
  });

  it("[PRES-09] a photo can be replaced and deleted at any time", async () => {
    const { ctx, guest } = await setup();
    await upload(ctx, guest, "me", await phoneJpeg(), "image/jpeg");
    const gone = await ctx.app.inject({
      method: "DELETE",
      url: "/api/profile/people/me/photo",
      headers: guest,
    });
    expect(gone.statusCode).toBe(200);
    expect(gone.json<ProfilePeopleResponse>().persons[0]?.photo).toBeNull();
    expect(
      (await ctx.app.inject({ url: "/api/profile/people/me/photo", headers: guest })).statusCode,
    ).toBe(404);
  });

  it("[PRES-09] a file that is not an image, or is damaged, or is too large, is refused", async () => {
    const { ctx, guest } = await setup();
    const text = await upload(ctx, guest, "me", Buffer.from("hello"), "image/jpeg");
    expect(text.statusCode).toBe(415);
    const damaged = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("not a jpeg")]);
    expect((await upload(ctx, guest, "me", damaged, "image/jpeg")).statusCode).toBe(422);
    const big = Buffer.alloc(PROFILE_LIMITS.photoBytes + 1, 1);
    expect((await upload(ctx, guest, "me", big, "image/png")).statusCode).toBe(413);
    expect((await people(ctx, guest)).persons[0]?.photo).toBeNull();
  });

  it("[PRES-09] a companion has a photo of their own that only their guest reads", async () => {
    const { ctx, guest } = await setup();
    const other = await signIn(ctx, "anders", ["vip"]);
    const mia = addCompanion(ctx, await idOf(ctx, guest), "Mia");
    expect(
      (await upload(ctx, guest, String(mia), await phoneJpeg(), "image/jpeg")).statusCode,
    ).toBe(200);
    expect((await people(ctx, guest)).persons[0]?.photo).toBeNull();
    const own = await ctx.app.inject({
      url: `/api/profile/people/${String(mia)}/photo`,
      headers: guest,
    });
    expect(own.statusCode).toBe(200);
    const foreign = await ctx.app.inject({
      url: `/api/profile/people/${String(mia)}/photo`,
      headers: other,
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe("the relation list (PRES-15)", () => {
  it("[PRES-15] the list starts with the six wedding defaults", async () => {
    const { ctx, guest } = await setup();
    expect((await people(ctx, guest)).relations.map((option) => option.name)).toEqual([
      "Familie Braut",
      "Familie Bräutigam",
      "Freunde Braut",
      "Freunde Bräutigam",
      "Freunde beider",
      "Arbeit",
    ]);
  });

  it("[PRES-15] the admin changes the list; an option keeps its id and the guests' choices, a removed one clears them", async () => {
    const { ctx, admin, guest } = await setup();
    const [first, second] = (await people(ctx, guest)).relations;
    await save(ctx, guest, "me", { relation: second?.id ?? 0 });
    const put = await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/profile/relations",
      headers: admin,
      payload: {
        relations: [{ id: second?.id, name: "Freunde der Braut" }, { name: "Nachbarn" }],
      },
    });
    expect(put.statusCode).toBe(200);
    const list = put.json<RelationsResponse>().relations;
    expect(list.map((option) => option.name)).toEqual(["Freunde der Braut", "Nachbarn"]);
    expect(list[0]?.id).toBe(second?.id);
    expect((await people(ctx, guest)).persons[0]?.relation).toBe(second?.id);
    // The first option is gone, so a guest who had chosen it has none.
    await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/profile/relations",
      headers: admin,
      payload: { relations: [{ name: "Nur noch einer" }] },
    });
    expect((await people(ctx, guest)).persons[0]?.relation).toBeNull();
    expect(first?.id).toBeDefined();
  });

  it("[PRES-15] a guest can only choose an option of the list", async () => {
    const { ctx, guest } = await setup();
    expect((await save(ctx, guest, "me", { relation: 9999 })).statusCode).toBe(422);
  });

  it("[PRES-15] only the admin changes the list, and it keeps at least one option without duplicates", async () => {
    const { ctx, admin, guest } = await setup();
    const put = (headers: Headers, relations: { name: string }[]) =>
      ctx.app.inject({
        method: "PUT",
        url: "/api/admin/profile/relations",
        headers,
        payload: { relations },
      });
    expect((await put(guest, [{ name: "x" }])).statusCode).toBe(403);
    expect((await put(admin, [])).statusCode).toBe(400);
    expect((await put(admin, [{ name: "Arbeit" }, { name: "arbeit" }])).statusCode).toBe(422);
    expect(
      (
        await put(
          admin,
          Array.from({ length: PROFILE_LIMITS.relations + 1 }, (_, i) => ({
            name: `o${String(i)}`,
          })),
        )
      ).statusCode,
    ).toBe(400);
  });
});

describe("the admin's removal (PRES-14)", () => {
  it("[PRES-14] the admin sees a guest's profiles and removes a photo, a greeting or a line, audited with ids only", async () => {
    const { ctx, admin, guest } = await setup();
    const userId = await idOf(ctx, guest);
    await upload(ctx, guest, "me", await phoneJpeg(), "image/jpeg");
    await save(ctx, guest, "me", { greeting: "Hallo", relationLine: "Nachbar" });
    const seen = await ctx.app.inject({
      url: `/api/admin/profiles/${String(userId)}`,
      headers: admin,
    });
    expect(seen.json<AdminProfilesResponse>().persons[0]).toMatchObject({
      key: `u${String(userId)}`,
      greeting: "Hallo",
      relationLine: "Nachbar",
    });
    const photo = await ctx.app.inject({
      url: `/api/admin/profiles/u${String(userId)}/photo?v=1`,
      headers: admin,
    });
    expect(photo.statusCode).toBe(200);
    for (const part of ["photo", "greeting", "relationLine"]) {
      const removed = await ctx.app.inject({
        method: "DELETE",
        url: `/api/admin/profiles/u${String(userId)}/${part}`,
        headers: admin,
      });
      expect(removed.statusCode).toBe(204);
    }
    expect((await people(ctx, guest)).persons[0]).toMatchObject({
      photo: null,
      greeting: null,
      relationLine: null,
    });
    const entries = ctx.database.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action === "profile.remove");
    expect(entries).toHaveLength(3);
    const details = entries.map((row) => row.details).join("");
    expect(details).toContain(`u${String(userId)}`);
    expect(details).not.toContain("Hallo");
    expect(details).not.toContain("Nachbar");
  });

  it("[PRES-14] a companion's profile is removed by its key; a guest cannot remove, and an unknown key is 404", async () => {
    const { ctx, admin, guest } = await setup();
    const mia = addCompanion(ctx, await idOf(ctx, guest), "Mia");
    await save(ctx, guest, String(mia), { greeting: "Hallo" });
    const denied = await ctx.app.inject({
      method: "DELETE",
      url: `/api/admin/profiles/c${String(mia)}/greeting`,
      headers: guest,
    });
    expect(denied.statusCode).toBe(403);
    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/admin/profiles/c${String(mia)}/greeting`,
      headers: admin,
    });
    expect(removed.statusCode).toBe(204);
    const unknown = await ctx.app.inject({
      method: "DELETE",
      url: "/api/admin/profiles/u9999/photo",
      headers: admin,
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe("deleting the account (ACC-12)", () => {
  it("[PRES-09][ACC-12] the guest's own profile goes with the account, the companion's stays with the entry", async () => {
    const { ctx, guest } = await setup();
    const userId = await idOf(ctx, guest);
    const mia = addCompanion(ctx, userId, "Mia");
    await save(ctx, guest, "me", { greeting: "Hallo" });
    await save(ctx, guest, String(mia), { greeting: "Hi" });
    await ctx.auth.accounts.deleteAccount(userId, "correct-horse-battery");
    const rows = ctx.database.db.select().from(profiles).all();
    expect(rows.map((row) => row.greeting)).toEqual(["Hi"]);
  });
});
