// The seating plan and the table finder (PRES-05 – PRES-07, PRES-12; sw-architecture.md 3.6): the admin makes the
// tables (a name and the number of places) and places the attending persons on them, a companion follows the guest,
// guests see their table from the date the admin sets. There are no seats and no map: only the table counts.
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

const requestTable = (
  ctx: TestContext,
  admin: Headers,
  method: "POST" | "PUT",
  path: string,
  body: { name: string; places: number },
) =>
  ctx.app.inject({
    method,
    url: `/api/admin/seating/tables${path}`,
    headers: admin,
    payload: body,
  });

/** Makes a table and returns its id. */
async function makeTable(
  ctx: TestContext,
  admin: Headers,
  name: string,
  places: number,
): Promise<number> {
  const made = await requestTable(ctx, admin, "POST", "", { name, places });
  expect(made.statusCode).toBe(201);
  const created = made.json<AdminSeatingResponse>().tables.find((table) => table.name === name);
  if (created === undefined) throw new Error("table not made");
  return created.id;
}

const place = (ctx: TestContext, admin: Headers, key: string, table: number | null) =>
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

describe("the tables (PRES-05)", () => {
  it("[PRES-05] the admin makes tables with a name and places; they are listed by name with numbers by value", async () => {
    const { ctx, admin } = await setup();
    await makeTable(ctx, admin, "10", 6);
    await makeTable(ctx, admin, "Edelweiss", 8);
    await makeTable(ctx, admin, "2", 4);
    const view = await plan(ctx, admin);
    expect(view.tables.map((table) => [table.name, table.places])).toEqual([
      ["2", 4],
      ["10", 6],
      ["Edelweiss", 8],
    ]);
    expect(view.visibleFrom).toBeNull();
  });

  it("[PRES-05] a table needs a name and between 1 and 100 places, and names are unique whatever the case", async () => {
    const { ctx, admin } = await setup();
    await makeTable(ctx, admin, "Enzian", 8);
    for (const body of [
      { name: "", places: 8 },
      { name: "   ", places: 8 },
      { name: "x".repeat(41), places: 8 },
      { name: "Leer", places: 0 },
      { name: "Riesig", places: 101 },
      { name: "Halb", places: 2.5 },
    ]) {
      expect((await requestTable(ctx, admin, "POST", "", body)).statusCode).toBe(400);
    }
    const twice = await requestTable(ctx, admin, "POST", "", { name: "ENZIAN", places: 4 });
    expect(twice.statusCode).toBe(409);
    expect(twice.json<{ error: { code: string } }>().error.code).toBe("table_duplicate");
    expect((await plan(ctx, admin)).tables).toHaveLength(1);
  });

  it("[PRES-05] a table is renamed and gets other places, but not fewer than the persons at it", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    addCompanion(ctx, anna.id, "Mia", item);
    const id = await makeTable(ctx, admin, "Enzian", 4);
    await makeTable(ctx, admin, "Edelweiss", 4);
    await place(ctx, admin, anna.key, id);
    expect(
      (await requestTable(ctx, admin, "PUT", `/${String(id)}`, { name: "Alpenrose", places: 3 }))
        .statusCode,
    ).toBe(200);
    const view = await plan(ctx, admin);
    expect(view.tables.find((table) => table.id === id)).toMatchObject({
      name: "Alpenrose",
      places: 3,
    });
    // The guest and the companion sit there: fewer than two places is refused, the name of another table too.
    const fewer = await requestTable(ctx, admin, "PUT", `/${String(id)}`, {
      name: "Alpenrose",
      places: 1,
    });
    expect(fewer.statusCode).toBe(409);
    expect(fewer.json<{ error: { code: string } }>().error.code).toBe("table_full");
    const taken = await requestTable(ctx, admin, "PUT", `/${String(id)}`, {
      name: "edelweiss",
      places: 3,
    });
    expect(taken.json<{ error: { code: string } }>().error.code).toBe("table_duplicate");
    expect(
      (await requestTable(ctx, admin, "PUT", "/999", { name: "X", places: 2 })).statusCode,
    ).toBe(404);
  });

  it("[PRES-05] a deleted table leaves its persons without a table", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    const id = await makeTable(ctx, admin, "Enzian", 4);
    await place(ctx, admin, anna.key, id);
    const gone = await ctx.app.inject({
      method: "DELETE",
      url: `/api/admin/seating/tables/${String(id)}`,
      headers: admin,
    });
    expect(gone.statusCode).toBe(200);
    const view = gone.json<AdminSeatingResponse>();
    expect(view.tables).toEqual([]);
    expect(view.unassigned.map((person) => person.key).sort()).toEqual([anna.key, mia.key].sort());
    expect(view.unassigned.every((person) => !person.placed)).toBe(true);
    expect(
      (
        await ctx.app.inject({
          method: "DELETE",
          url: `/api/admin/seating/tables/${String(id)}`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe("the plan (PRES-05, PRES-07)", () => {
  it("[PRES-05] only persons who attend are in the plan: guests and approved companions with a yes", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    await signIn(ctx, "stille", ["vip"]); // no RSVP: not in the plan
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    const view = await plan(ctx, admin);
    expect(view.unassigned.map((person) => person.key).sort()).toEqual([anna.key, mia.key].sort());
    expect(view.unassigned.find((person) => person.key === mia.key)?.companionOf).toBe("anna");
  });

  it("[PRES-05][PRES-07] a guest placed at a table takes their companions along, who can be placed elsewhere and follow again", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    const one = await makeTable(ctx, admin, "1", 3);
    const three = await makeTable(ctx, admin, "3", 1);
    expect((await place(ctx, admin, anna.key, one)).statusCode).toBe(200);
    let view = await plan(ctx, admin);
    expect(view.tables[0]?.persons.map((person) => person.name).sort()).toEqual(["Mia", "anna"]);
    expect(view.tables[0]?.persons.find((person) => person.key === mia.key)?.placed).toBe(false);
    // The admin places the companion at another table: she leaves the guest's.
    expect((await place(ctx, admin, mia.key, three)).statusCode).toBe(200);
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
    const one = await makeTable(ctx, admin, "1", 3);
    const three = await makeTable(ctx, admin, "3", 1);
    // Table 3 has one place: a guest with a companion do not fit, a single guest does.
    const refused = await place(ctx, admin, anna.key, three);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ error: { code: string } }>().error.code).toBe("table_full");
    expect((await place(ctx, admin, bert.key, three)).statusCode).toBe(200);
    expect((await plan(ctx, admin)).tables[1]?.persons).toHaveLength(1);
    expect((await place(ctx, admin, anna.key, one)).statusCode).toBe(200);
  });

  it("[PRES-05] a person who does not attend, or a table that does not exist, is refused", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const stille = await signIn(ctx, "stille", ["vip"]);
    const stilleId = await idOf(ctx, stille);
    const one = await makeTable(ctx, admin, "1", 3);
    expect((await place(ctx, admin, `u${String(stilleId)}`, one)).statusCode).toBe(404);
    expect((await place(ctx, admin, anna.key, 999)).statusCode).toBe(404);
    expect((await place(ctx, admin, "x1", one)).statusCode).toBe(404);
  });

  it("[PRES-05] only the admin sees and changes the plan, and every change is audited with ids only", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const body = { name: "Enzian", places: 4 };
    expect(
      (await ctx.app.inject({ url: "/api/admin/seating", headers: anna.headers })).statusCode,
    ).toBe(403);
    expect((await requestTable(ctx, anna.headers, "POST", "", body)).statusCode).toBe(403);
    expect((await place(ctx, anna.headers, anna.key, 1)).statusCode).toBe(403);
    expect((await ctx.app.inject({ url: "/api/admin/seating" })).statusCode).toBe(401);
    const id = await makeTable(ctx, admin, "Enzian", 4);
    await place(ctx, admin, anna.key, id);
    await visibleFrom(ctx, admin, new Date(Date.now() - DAY));
    const entries = ctx.database.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action.startsWith("seating."));
    expect(entries.map((row) => row.action)).toEqual([
      "seating.table.create",
      "seating.assign",
      "seating.visibility",
    ]);
    // Ids and numbers only: neither a guest's name nor the table's name is written to the log.
    const logged = entries.map((row) => row.details).join("");
    expect(logged).not.toContain("anna");
    expect(logged).not.toContain("Enzian");
  });
});

describe("the table finder (PRES-06, PRES-12)", () => {
  it("[PRES-06] the plan is hidden until the date the admin set, and without a date; the notice carries the date", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    await place(ctx, admin, anna.key, await makeTable(ctx, admin, "1", 3));
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

  it("[PRES-06][PRES-12] a guest sees their table with its places and their tablemates with greeting, badge and line, no seat and no map", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const bert = await attendingGuest(ctx, "bert", item);
    const one = await makeTable(ctx, admin, "1", 3);
    await place(ctx, admin, anna.key, one);
    await place(ctx, admin, bert.key, one);
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
    expect(seen.tables[0]).toMatchObject({ name: "1", places: 3, party: ["anna"] });
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
    expect(JSON.stringify(seen)).not.toMatch(/seat|platz|map/i);
  });

  it("[PRES-07] a companion is a tablemate of the guest's table and at their own table appears as an extra table of the guest", async () => {
    const { ctx, admin } = await setup();
    const item = programItem(ctx);
    const anna = await attendingGuest(ctx, "anna", item);
    const mia = addCompanion(ctx, anna.id, "Mia", item);
    const bert = await attendingGuest(ctx, "bert", item);
    const one = await makeTable(ctx, admin, "1", 4);
    const three = await makeTable(ctx, admin, "3", 2);
    await place(ctx, admin, anna.key, one);
    await place(ctx, admin, bert.key, one);
    await visibleFrom(ctx, admin, new Date(Date.now() - 1000));
    const together = await finder(ctx, anna.headers);
    expect(together.tables.map((table) => table.party)).toEqual([["anna", "Mia"]]);
    expect(together.tables[0]?.mates.map((mate) => [mate.name, mate.companionOf])).toEqual([
      ["bert", null],
      ["Mia", "anna"],
    ]);
    await place(ctx, admin, mia.key, three);
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
    const one = await makeTable(ctx, admin, "1", 3);
    await place(ctx, admin, anna.key, one);
    await place(ctx, admin, bert.key, one);
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
