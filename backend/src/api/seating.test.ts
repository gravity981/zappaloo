// The seating plan and the table finder (PRES-05 – PRES-07, PRES-12; sw-architecture.md 3.6): the tables are the
// seat objects of the world (the test world: table 1 with three places, table 3 with one), the admin places the
// attending persons, a companion follows the guest, guests see their table from the date the admin sets.
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminSeatingResponse, SeatingGuestResponse } from "@zappaloo/shared";
import {
  auditLog,
  companionAttendance,
  companions,
  programItems,
  rsvpAttendance,
} from "../database/schema.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { buildTestWorld } from "../world/build.ts";

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
  const imported = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/world",
    headers: { ...admin, "content-type": "application/vnd.zappaloo.world" },
    payload: buildTestWorld(),
  });
  expect(imported.statusCode).toBe(200);
  return { ctx, admin };
}

const idOf = async (ctx: TestContext, headers: Headers): Promise<number> =>
  (await ctx.app.inject({ url: "/api/session", headers })).json<{ user: { id: number } }>().user.id;

/** An attending guest: a vip account with a yes for one program item. */
async function attendingGuest(ctx: TestContext, name: string, item: number) {
  const headers = await signIn(ctx, name, ["vip"]);
  const id = await idOf(ctx, headers);
  ctx.database.db
    .insert(rsvpAttendance)
    .values({ eventId: "event1", userId: id, programItemId: item, attending: true })
    .run();
  return { headers, id, key: `u${String(id)}` };
}

function addCompanion(ctx: TestContext, hostUserId: number, name: string, item: number) {
  const id = ctx.database.db
    .insert(companions)
    .values({ eventId: "event1", hostUserId, name, status: "approved", createdAt: new Date() })
    .returning({ id: companions.id })
    .get().id;
  ctx.database.db
    .insert(companionAttendance)
    .values({ eventId: "event1", companionId: id, programItemId: item, attending: true })
    .run();
  return { id, key: `c${String(id)}` };
}

const programItem = (ctx: TestContext) =>
  ctx.database.db
    .insert(programItems)
    .values({ eventId: "event1", name: "Dinner", createdAt: new Date() })
    .returning({ id: programItems.id })
    .get().id;

const plan = async (ctx: TestContext, admin: Headers) =>
  (
    await ctx.app.inject({ url: "/api/admin/seating", headers: admin })
  ).json<AdminSeatingResponse>();

const place = (ctx: TestContext, admin: Headers, key: string, table: string | null) =>
  ctx.app.inject({
    method: "PUT",
    url: `/api/admin/seating/assignments/${key}`,
    headers: admin,
    payload: { table },
  });

const visibleFrom = (ctx: TestContext, admin: Headers, at: Date | null) =>
  ctx.app.inject({
    method: "PUT",
    url: "/api/admin/seating/visibility",
    headers: admin,
    payload: { visibleFrom: at === null ? null : at.toISOString() },
  });

const finder = async (ctx: TestContext, headers: Headers) =>
  (await ctx.app.inject({ url: "/api/seating", headers })).json<SeatingGuestResponse>();

const DAY = 24 * 60 * 60 * 1000;

describe("the tables and the plan (PRES-05)", () => {
  it("[PRES-05] the tables are the seat objects of the world, each with as many places as seats; only attending persons are listed", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    await signIn(ctx, "stille", ["vip"]); // no RSVP: not in the plan
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    const view = await plan(ctx, admin);
    expect(view.tables.map((table) => [table.name, table.places, table.map])).toEqual([
      ["1", 3, "saal"],
      ["3", 1, "saal"],
    ]);
    expect(view.unassigned.map((person) => person.key).sort()).toEqual([anna.key, mia.key].sort());
    expect(view.unassigned.find((person) => person.key === mia.key)?.companionOf).toBe("anna");
    expect(view.visibleFrom).toBeNull();
  });

  it("[PRES-05][PRES-07] a guest placed at a table takes their companions along, who can be placed elsewhere and follow again", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    expect((await place(ctx, admin, anna.key, "1")).statusCode).toBe(200);
    let view = await plan(ctx, admin);
    expect(view.tables[0]?.persons.map((person) => person.name).sort()).toEqual(["Mia", "anna"]);
    expect(view.tables[0]?.persons.find((person) => person.key === mia.key)?.placed).toBe(false);
    // The admin places the companion at another table: she leaves the guest's.
    expect((await place(ctx, admin, mia.key, "3")).statusCode).toBe(200);
    view = await plan(ctx, admin);
    expect(view.tables.map((table) => table.persons.map((person) => person.name))).toEqual([
      ["anna"],
      ["Mia"],
    ]);
    expect(view.tables[1]?.persons[0]?.placed).toBe(true);
    // Taking the place away lets her follow the guest again; the guest unassigned leaves everyone without a table.
    await place(ctx, admin, mia.key, null);
    expect((await plan(ctx, admin)).tables[0]?.persons).toHaveLength(2);
    await place(ctx, admin, anna.key, null);
    view = await plan(ctx, admin);
    expect(view.tables.every((table) => table.persons.length === 0)).toBe(true);
    expect(view.unassigned).toHaveLength(2);
  });

  it("[PRES-05] a table takes no more persons than it has places, companions who follow the guest included", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    addCompanion(ctx, anna.id, "Mia", item);
    const bert = await attendingGuest(ctx, "bert", item);
    // Table 3 has one place: a guest with a companion do not fit, a single guest does.
    const refused = await place(ctx, admin, anna.key, "3");
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ error: { code: string } }>().error.code).toBe("table_full");
    expect((await place(ctx, admin, bert.key, "3")).statusCode).toBe(200);
    expect((await plan(ctx, admin)).tables[1]?.persons).toHaveLength(1);
    expect((await place(ctx, admin, anna.key, "1")).statusCode).toBe(200);
  });

  it("[PRES-05] a person who does not attend, or a table that does not exist, is refused", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const stille = await signIn(ctx, "stille", ["vip"]);
    const stilleId = await idOf(ctx, stille);
    expect((await place(ctx, admin, `u${String(stilleId)}`, "1")).statusCode).toBe(404);
    expect((await place(ctx, admin, anna.key, "99")).statusCode).toBe(404);
    expect((await place(ctx, admin, "x1", "1")).statusCode).toBe(404);
  });

  it("[PRES-05] only the admin sees and changes the plan, and every change is audited with ids only", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    expect(
      (await ctx.app.inject({ url: "/api/admin/seating", headers: anna.headers })).statusCode,
    ).toBe(403);
    expect((await place(ctx, anna.headers, anna.key, "1")).statusCode).toBe(403);
    expect((await ctx.app.inject({ url: "/api/admin/seating" })).statusCode).toBe(401);
    await place(ctx, admin, anna.key, "1");
    await visibleFrom(ctx, admin, new Date(Date.now() - DAY));
    const entries = ctx.database.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action.startsWith("seating."));
    expect(entries.map((row) => row.action)).toEqual(["seating.assign", "seating.visibility"]);
    expect(entries.map((row) => row.details).join("")).not.toContain("anna");
  });
});

describe("the table finder (PRES-06, PRES-12)", () => {
  it("[PRES-06] the plan is hidden until the date the admin set, and without a date; the notice carries the date", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    await place(ctx, admin, anna.key, "1");
    expect(await finder(ctx, anna.headers)).toEqual({
      visible: false,
      visibleFrom: null,
      tables: [],
    });
    const later = new Date(Date.now() + DAY);
    await visibleFrom(ctx, admin, later);
    expect(await finder(ctx, anna.headers)).toEqual({
      visible: false,
      visibleFrom: later.toISOString(),
      tables: [],
    });
    await visibleFrom(ctx, admin, new Date(Date.now() - 1000));
    expect((await finder(ctx, anna.headers)).visible).toBe(true);
    // The admin takes the date away again: hidden.
    await visibleFrom(ctx, admin, null);
    expect((await finder(ctx, anna.headers)).visible).toBe(false);
  });

  it("[PRES-06][PRES-12] a guest sees their table with its map, its places and their tablemates with greeting, badge and line, no seat", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const bert = await attendingGuest(ctx, "bert", item);
    await place(ctx, admin, anna.key, "1");
    await place(ctx, admin, bert.key, "1");
    const relation = (
      await ctx.app.inject({ url: "/api/profile/people", headers: bert.headers })
    ).json<{ relations: { id: number; name: string }[] }>().relations[1];
    await ctx.app.inject({
      method: "PUT",
      url: "/api/profile/people/me",
      headers: bert.headers,
      payload: { greeting: "Hallo!", relation: relation?.id, relationLine: "Nachbar" },
    });
    await visibleFrom(ctx, admin, new Date(Date.now() - 1000));
    const seen = await finder(ctx, anna.headers);
    expect(seen.tables).toHaveLength(1);
    expect(seen.tables[0]).toMatchObject({
      name: "1",
      map: "saal",
      places: 3,
      party: ["anna"],
    });
    expect(seen.tables[0]?.mates).toEqual([
      {
        key: bert.key,
        name: "bert",
        companionOf: null,
        greeting: "Hallo!",
        badge: relation?.name,
        line: "Nachbar",
        photo: null,
      },
    ]);
    expect(JSON.stringify(seen)).not.toContain("platz");
  });

  it("[PRES-07] a companion is a tablemate of the guest's table and at their own table appears as an extra table of the guest", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    const bert = await attendingGuest(ctx, "bert", item);
    await place(ctx, admin, anna.key, "1");
    await place(ctx, admin, bert.key, "1");
    await visibleFrom(ctx, admin, new Date(Date.now() - 1000));
    const together = await finder(ctx, anna.headers);
    expect(together.tables.map((table) => table.party)).toEqual([["anna", "Mia"]]);
    expect(together.tables[0]?.mates.map((mate) => [mate.name, mate.companionOf])).toEqual([
      ["bert", null],
      ["Mia", "anna"],
    ]);
    await place(ctx, admin, mia.key, "3");
    const apart = await finder(ctx, anna.headers);
    expect(apart.tables.map((table) => [table.name, table.party])).toEqual([
      ["1", ["anna"]],
      ["3", ["Mia"]],
    ]);
    // A guest without a place has no table.
    const carl = await attendingGuest(ctx, "carl", item);
    expect((await finder(ctx, carl.headers)).tables).toEqual([]);
  });

  it("[PRES-12] the photo of a tablemate is served to the guest at their table only, and only once the plan is visible", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const bert = await attendingGuest(ctx, "bert", item);
    const carl = await attendingGuest(ctx, "carl", item);
    await place(ctx, admin, anna.key, "1");
    await place(ctx, admin, bert.key, "1");
    for (const guest of [bert, carl]) {
      await ctx.app.inject({
        method: "PUT",
        url: "/api/profile/people/me/photo",
        headers: { ...guest.headers, "content-type": "image/jpeg" },
        payload: await sharp({
          create: { width: 200, height: 100, channels: 3, background: "#369" },
        })
          .jpeg()
          .toBuffer(),
      });
    }
    const url = (key: string) => `/api/seating/photo/${key}?v=1`;
    expect((await ctx.app.inject({ url: url(bert.key), headers: anna.headers })).statusCode).toBe(
      404,
    );
    await visibleFrom(ctx, admin, new Date(Date.now() - 1000));
    const served = await ctx.app.inject({ url: url(bert.key), headers: anna.headers });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    // Carl has a photo but is no tablemate of anna; nobody without a session gets any.
    expect((await ctx.app.inject({ url: url(carl.key), headers: anna.headers })).statusCode).toBe(
      404,
    );
    expect((await ctx.app.inject({ url: url(bert.key) })).statusCode).toBe(401);
  });

  it("[PRES-06] the table finder needs a signed-in user", async () => {
    const { ctx } = await setup();
    expect((await ctx.app.inject({ url: "/api/seating" })).statusCode).toBe(401);
  });
});
