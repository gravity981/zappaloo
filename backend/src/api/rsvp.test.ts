import { afterEach, describe, expect, it } from "vitest";
import type {
  ActivityEntry,
  ProgramItem,
  IssuedInvitation,
  MenuOption,
  Role,
  RsvpOverview,
  RsvpState,
} from "@zappaloo/shared";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

interface SignedIn {
  cookie: string;
  csrf: string;
  id: number;
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}
const failTest = (): never => {
  throw new Error("expected a value");
};

const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

async function makeUser(ctx: TestContext, username: string, roles: Role[]): Promise<SignedIn> {
  const user = ctx.auth.accounts.createUser({ username, roles, displayName: username }, "cli");
  const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
  await ctx.auth.accounts.useLink(link.token, PASSWORD);
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/session",
    payload: { username, password: PASSWORD },
  });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("no session cookie");
  return {
    id: user.id,
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

/** A set-up event with an admin, the program items Trauung, Apéro, Dinner (meal), Party and two menus. */
async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  const root = await makeUser(ctx, "root", ["admin"]);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  const call = async <T>(
    who: SignedIn,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object | string,
  ) => {
    const response = await ctx.app.inject({
      method,
      url,
      headers: as(who),
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<T>() : undefined,
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  const get = async <T>(who: SignedIn, url: string) => {
    const response = await ctx.app.inject({ url, headers: { cookie: who.cookie } });
    return {
      status: response.statusCode,
      body: (response.headers["content-type"]?.toString().includes("json")
        ? response.json()
        : undefined) as T,
      raw: response,
    };
  };
  const programItems: ProgramItem[] = [];
  // The place of the program items is a place of Inhalte (CNT-07).
  const placed = await call<{ places: { id: number; name: string }[] }>(
    root,
    "POST",
    "/api/content/places",
    { name: "Linde", address: null, mapsUrl: null, mapImageId: null },
  );
  const lindeId = must(must(placed.body).places.find((place) => place.name === "Linde")).id;
  for (const [name, hour, hasMeal] of [
    ["Trauung", 14, false],
    ["Apéro", 15, false],
    ["Dinner", 18, true],
    ["Party", 22, false],
  ] as const) {
    const made = await call<ProgramItem>(root, "POST", "/api/admin/rsvp/program-items", {
      name,
      startsAt: `2027-06-12T${String(hour)}:00:00.000Z`,
      placeId: lindeId,
      hasMeal,
    });
    expect(made.status).toBe(201);
    programItems.push(must(made.body));
  }
  // The tests of this file answer per program item and approve companions (the settings of
  // 7.4.1); the defaults of 7.4.2 are tested on their own.
  await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: true });
  await call(root, "PUT", "/api/admin/rsvp/companion-approval", { enabled: true });
  const menus: MenuOption[] = [];
  for (const name of ["Fleisch", "Vegetarisch"]) {
    const made = await call<MenuOption>(root, "POST", "/api/admin/rsvp/menus", { name });
    menus.push(must(made.body));
  }
  /** A guest account, invited to the given program items (default: all four). */
  const guest = async (username: string, programItemIds = programItems.map((p) => p.id)) => {
    const who = await makeUser(ctx, username, ["vip"]);
    await call(root, "PUT", `/api/admin/users/${String(who.id)}/program-items`, { programItemIds });
    return who;
  };
  return { ctx, root, call, get, programItems, menus, guest };
}

const ids = (programItems: ProgramItem[], ...names: string[]) =>
  programItems.filter((p) => names.includes(p.name)).map((p) => p.id);
const yes = (programItems: ProgramItem[], ...names: string[]) =>
  programItems.map((p) => ({ programItemId: p.id, attending: names.includes(p.name) }));

describe("program items, menus and the deadline", () => {
  it("[RSVP-02] the admin creates, changes and deletes program items; at most one has the meal", async () => {
    const { root, call, get, programItems } = await setup();
    const config = (await get<{ programItems: ProgramItem[] }>(root, "/api/admin/rsvp/config"))
      .body;
    expect(config.programItems.map((p) => p.name)).toEqual(["Trauung", "Apéro", "Dinner", "Party"]);
    expect(config.programItems.filter((p) => p.hasMeal).map((p) => p.name)).toEqual(["Dinner"]);

    // Marking another program item moves the meal.
    const apero = must(programItems.find((p) => p.name === "Apéro"));
    const moved = await call<ProgramItem>(
      root,
      "PATCH",
      `/api/admin/rsvp/program-items/${String(apero.id)}`,
      {
        hasMeal: true,
      },
    );
    expect(moved.body?.hasMeal).toBe(true);
    const after = (await get<{ programItems: ProgramItem[] }>(root, "/api/admin/rsvp/config")).body;
    expect(after.programItems.filter((p) => p.hasMeal).map((p) => p.name)).toEqual(["Apéro"]);

    // Program items are ordered by time, not by creation.
    await call(root, "PATCH", `/api/admin/rsvp/program-items/${String(apero.id)}`, {
      startsAt: "2027-06-12T10:00:00.000Z",
      placeId: null,
    });
    const reordered = (await get<{ programItems: ProgramItem[] }>(root, "/api/admin/rsvp/config"))
      .body;
    expect(reordered.programItems[0]?.name).toBe("Apéro");
    expect(reordered.programItems[0]?.place).toBeNull();

    expect(
      (await call(root, "DELETE", `/api/admin/rsvp/program-items/${String(apero.id)}`)).status,
    ).toBe(204);
    expect(
      (await call(root, "DELETE", `/api/admin/rsvp/program-items/${String(apero.id)}`)).status,
    ).toBe(404);
    expect(
      (await call(root, "PATCH", "/api/admin/rsvp/program-items/999", { name: "X" })).status,
    ).toBe(404);
  });

  it("[RSVP-02][RSVP-03] input is validated and only admins change the configuration", async () => {
    const { ctx, root, call, guest } = await setup();
    expect(
      (await call(root, "POST", "/api/admin/rsvp/program-items", { name: "", startsAt: "x" }))
        .status,
    ).toBe(400);
    expect((await call(root, "POST", "/api/admin/rsvp/menus", { name: " " })).status).toBe(400);
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "1. Mai" })).status,
    ).toBe(400);
    const anna = await guest("anna");
    for (const [method, url, payload] of [
      [
        "POST",
        "/api/admin/rsvp/program-items",
        { name: "X", startsAt: "2027-06-12T10:00:00.000Z" },
      ],
      ["POST", "/api/admin/rsvp/menus", { name: "X" }],
      ["PUT", "/api/admin/rsvp/deadline", { deadline: null }],
      ["PUT", "/api/admin/users/1/program-items", { programItemIds: [] }],
    ] as const) {
      expect((await call(anna, method, url, payload)).status, url).toBe(403);
    }
    expect(
      (await ctx.app.inject({ url: "/api/admin/rsvp/config", headers: { cookie: anna.cookie } }))
        .statusCode,
    ).toBe(403);
  });

  it("[RSVP-03] the admin manages one list of menu options", async () => {
    const { root, call, get, menus } = await setup();
    const first = must(menus[0]);
    const renamed = await call<MenuOption>(
      root,
      "PATCH",
      `/api/admin/rsvp/menus/${String(first.id)}`,
      {
        name: "Fleisch (Rind)",
      },
    );
    expect(renamed.body?.name).toBe("Fleisch (Rind)");
    expect((await call(root, "DELETE", `/api/admin/rsvp/menus/${String(first.id)}`)).status).toBe(
      204,
    );
    expect(
      (await get<{ menus: MenuOption[] }>(root, "/api/admin/rsvp/config")).body.menus.map(
        (m) => m.name,
      ),
    ).toEqual(["Vegetarisch"]);
    expect((await call(root, "DELETE", "/api/admin/rsvp/menus/999")).status).toBe(404);
  });

  it("[RSVP-04] the admin sets and removes the deadline", async () => {
    const { root, call, get } = await setup();
    expect(
      (await get<{ deadline: string | null }>(root, "/api/admin/rsvp/config")).body.deadline,
    ).toBeNull();
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2027-05-01" })).status,
    ).toBe(204);
    expect(
      (await get<{ deadline: string | null }>(root, "/api/admin/rsvp/config")).body.deadline,
    ).toBe("2027-05-01");
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: null });
    expect(
      (await get<{ deadline: string | null }>(root, "/api/admin/rsvp/config")).body.deadline,
    ).toBeNull();
  });
});

describe("invited program items", () => {
  async function invite(
    ctx: TestContext,
    root: SignedIn,
    payload: Record<string, unknown>,
  ): Promise<IssuedInvitation> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/invitations",
      headers: as(root),
      payload: { guests: [{ name: "Erika Huber" }], ...payload },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ invitations: IssuedInvitation[] }>().invitations[0] ?? failTest();
  }
  const redeem = (ctx: TestContext, code: string, username: string) =>
    ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${code}/register`,
      payload: { username, password: PASSWORD },
    });

  it("[RSVP-02] an invitation carries its program items, all program items by default, and the guest gets them", async () => {
    const { ctx, root, get, programItems } = await setup();
    const some = await invite(ctx, root, { programItemIds: ids(programItems, "Apéro", "Dinner") });
    const all = await invite(ctx, root, {});
    expect(some.programItemIds).toEqual(ids(programItems, "Apéro", "Dinner"));
    expect(all.programItemIds).toEqual(programItems.map((p) => p.id));

    expect((await redeem(ctx, some.code, "erika")).statusCode).toBe(201);
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "erika", password: PASSWORD },
    });
    const cookie = `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ""}`;
    const state = (await get<RsvpState>({ cookie, csrf: "", id: 0 }, "/api/rsvp")).body;
    expect(state.programItems.map((p) => p.name)).toEqual(["Apéro", "Dinner"]);
    expect(state.name).toBe("Erika Huber");

    // The invitation list shows the program items of the account once redeemed.
    const list = (
      await get<{ invitations: { id: number; programItemIds: number[] }[] }>(
        root,
        "/api/admin/invitations",
      )
    ).body;
    expect(list.invitations.find((i) => i.id === some.id)?.programItemIds).toEqual(
      ids(programItems, "Apéro", "Dinner"),
    );
  });

  it("[RSVP-02] an unknown program item is refused when creating an invitation", async () => {
    const { ctx, root } = await setup();
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/invitations",
      headers: as(root),
      payload: { guests: [{ name: "X" }], programItemIds: [999] },
    });
    expect(response.statusCode).toBe(404);
  });

  it("[RSVP-02] the program items of an invitation are those of the guest's account: the admin changes them in the account panel, before and after redeeming, and a regenerated code keeps them", async () => {
    const { ctx, root, call, get, programItems } = await setup();
    const first = await invite(ctx, root, { programItemIds: ids(programItems, "Trauung") });
    const panel = (userId: number | null, names: string[]) =>
      call(root, "PUT", `/api/admin/users/${String(userId)}/program-items`, {
        programItemIds: ids(programItems, ...names),
      });
    expect((await panel(first.userId, ["Trauung", "Dinner"])).status).toBe(200);
    const listed = () =>
      get<{ invitations: IssuedInvitation[] }>(root, "/api/admin/invitations").then((r) =>
        r.body.invitations.map((i) => [i.id, i.programItemIds]),
      );
    expect(await listed()).toEqual([[first.id, ids(programItems, "Trauung", "Dinner")]]);
    // There is no way to change them on the invitation row any more.
    expect(
      (
        await call(root, "PUT", `/api/admin/invitations/${String(first.id)}/program-items`, {
          programItemIds: [],
        })
      ).status,
    ).toBe(404);

    const regenerated = await call<IssuedInvitation>(
      root,
      "POST",
      `/api/admin/invitations/${String(first.id)}/regenerate`,
    );
    expect(regenerated.body?.programItemIds).toEqual(ids(programItems, "Trauung", "Dinner"));

    const code = must(regenerated.body);
    await redeem(ctx, code.code, "erika");
    expect((await panel(code.userId, ["Party"])).status).toBe(200);
    const users = (
      await get<{ users: { username: string; invitedProgramItemIds: number[] }[] }>(
        root,
        "/api/admin/users",
      )
    ).body.users;
    expect(users.find((u) => u.username === "erika")?.invitedProgramItemIds).toEqual(
      ids(programItems, "Party"),
    );
  });

  it("[RSVP-02] a vip made by an admin is invited to the program items of the form; revoking vip clears them", async () => {
    const { ctx, root, call, get, programItems } = await setup();
    const created = await call<{ user: { id: number } }>(root, "POST", "/api/admin/users", {
      username: "oma",
      roles: ["vip"],
      programItemIds: programItems.map((p) => p.id),
    });
    const id = created.body?.user.id ?? 0;
    const users = () =>
      get<{ users: { id: number; invitedProgramItemIds: number[] }[] }>(
        root,
        "/api/admin/users",
      ).then((r) => r.body.users.find((u) => u.id === id)?.invitedProgramItemIds);
    expect(await users()).toEqual(programItems.map((p) => p.id));

    // The account panel changes them; unknown program items are refused.
    await call(root, "PUT", `/api/admin/users/${String(id)}/program-items`, {
      programItemIds: ids(programItems, "Dinner"),
    });
    expect(await users()).toEqual(ids(programItems, "Dinner"));
    expect(
      (
        await call(root, "PUT", `/api/admin/users/${String(id)}/program-items`, {
          programItemIds: [999],
        })
      ).status,
    ).toBe(404);

    // A user without vip has no program items; promoting through the roles gives all program items.
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    expect(
      (
        await call(root, "PUT", `/api/admin/users/${String(helper.id)}/program-items`, {
          programItemIds: [],
        })
      ).status,
    ).toBe(409);
    await call(root, "PUT", `/api/admin/users/${String(helper.id)}/roles`, {
      roles: ["staff", "vip"],
    });
    const helperProgramItems = (
      await get<{ users: { id: number; invitedProgramItemIds: number[] }[] }>(
        root,
        "/api/admin/users",
      )
    ).body.users.find((u) => u.id === helper.id)?.invitedProgramItemIds;
    expect(helperProgramItems).toEqual(programItems.map((p) => p.id));
    await call(root, "PUT", `/api/admin/users/${String(helper.id)}/roles`, { roles: ["staff"] });
    const cleared = (
      await get<{ users: { id: number; invitedProgramItemIds: number[] }[] }>(
        root,
        "/api/admin/users",
      )
    ).body.users.find((u) => u.id === helper.id)?.invitedProgramItemIds;
    expect(cleared).toEqual([]);
  });
});

describe("answering the RSVP", () => {
  it("[RSVP-01] a guest sees only the program items they are invited to and answers yes or no for each", async () => {
    const { get, call, programItems, guest, menus } = await setup();
    const anna = await guest("anna", ids(programItems, "Apéro", "Dinner"));
    const state = (await get<RsvpState>(anna, "/api/rsvp")).body;
    expect(state.programItems.map((p) => p.name)).toEqual(["Apéro", "Dinner"]);
    expect(state.answer).toBeNull();
    expect(state.menus.map((m) => m.name)).toEqual(["Fleisch", "Vegetarisch"]);
    expect(state.closed).toBe(false);

    const saved = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(
        programItems.filter((p) => ["Apéro", "Dinner"].includes(p.name)),
        "Apéro",
        "Dinner",
      ),
      menuId: menus[1]?.id,
    });
    expect(saved.status).toBe(200);
    expect(saved.body?.answer?.attendingItemIds).toEqual(ids(programItems, "Apéro", "Dinner"));
    expect(saved.body?.answer?.menuId).toBe(menus[1]?.id);

    // Changing the answer replaces it.
    const changed = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(
        programItems.filter((p) => ["Apéro", "Dinner"].includes(p.name)),
        "Apéro",
      ),
    });
    expect(changed.body?.answer?.attendingItemIds).toEqual(ids(programItems, "Apéro"));
    expect(changed.body?.answer?.menuId).toBeNull();
  });

  it("[RSVP-01] every invited program item must be answered once, and no other program item", async () => {
    const { call, programItems, guest } = await setup();
    const anna = await guest("anna", ids(programItems, "Apéro", "Dinner"));
    const [apero, dinner, trauung] = [
      must(programItems.find((p) => p.name === "Apéro")),
      must(programItems.find((p) => p.name === "Dinner")),
      must(programItems.find((p) => p.name === "Trauung")),
    ];
    const attempt = async (attendance: unknown) =>
      (await call(anna, "PUT", "/api/rsvp", { attendance })).status;
    expect(await attempt([{ programItemId: apero.id, attending: true }])).toBe(400); // Dinner missing
    expect(
      await attempt([
        { programItemId: apero.id, attending: true },
        { programItemId: dinner.id, attending: false },
        { programItemId: trauung.id, attending: true },
      ]),
    ).toBe(400); // not invited
    expect(
      await attempt([
        { programItemId: apero.id, attending: true },
        { programItemId: apero.id, attending: false },
      ]),
    ).toBe(400); // twice
    expect(await attempt("yes")).toBe(400);
  });

  it("[RSVP-03] the menu is asked only for guests attending the meal program item, and then it is required", async () => {
    const { call, get, programItems, guest, menus } = await setup();
    const anna = await guest("anna");
    const put = (body: Record<string, unknown>) => call<RsvpState>(anna, "PUT", "/api/rsvp", body);

    // Attending the dinner without a menu choice.
    const missing = await put({ attendance: yes(programItems, "Dinner") });
    expect(missing.status).toBe(400);
    expect((missing.body as unknown as { error: { code: string } }).error.code).toBe(
      "menu_required",
    );
    expect((await put({ attendance: yes(programItems, "Dinner"), menuId: 999 })).status).toBe(400);

    const ok = await put({
      attendance: yes(programItems, "Dinner", "Party"),
      menuId: menus[0]?.id,
      allergies: "Nüsse",
      songWish: "ABBA – Dancing Queen",
    });
    expect(ok.body?.answer).toMatchObject({ menuId: menus[0]?.id, allergies: "Nüsse" });

    // Not attending the meal: no menu is asked and a chosen one is not kept.
    const noMeal = await put({
      attendance: yes(programItems, "Trauung", "Party"),
      menuId: menus[0]?.id,
    });
    expect(noMeal.status).toBe(200);
    expect(noMeal.body?.answer?.menuId).toBeNull();
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer?.menuId).toBeNull();
  });

  it("[RSVP-03] without menu options, or without a meal program item, nobody has to choose", async () => {
    const { root, call, programItems, guest, menus } = await setup();
    const anna = await guest("anna");
    for (const menu of menus)
      await call(root, "DELETE", `/api/admin/rsvp/menus/${String(menu.id)}`);
    expect(
      (await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems, "Dinner") })).status,
    ).toBe(200);
  });

  it("[RSVP-06] the song wish is optional; declining every program item keeps no menu, allergies or song wish", async () => {
    const { call, get, programItems, guest, menus } = await setup();
    const anna = await guest("anna");
    const first = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung"),
    });
    expect(first.body?.answer?.songWish).toBeNull();
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Dinner"),
      menuId: menus[0]?.id,
      allergies: "Laktose",
      songWish: "Queen",
    });
    const declined = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems),
    });
    expect(declined.body?.answer).toMatchObject({
      attendingItemIds: [],
      menuId: null,
      allergies: null,
      songWish: null,
    });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer).not.toBeNull();
    expect(
      (
        await call(anna, "PUT", "/api/rsvp", {
          attendance: yes(programItems, "Trauung"),
          songWish: "x".repeat(201),
        })
      ).status,
    ).toBe(400);
  });

  it("[RSVP-01] only guests answer: an admin or staff member without vip has no RSVP", async () => {
    const { ctx, root, call, programItems } = await setup();
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    expect((await call(root, "PUT", "/api/rsvp", { attendance: yes(programItems) })).status).toBe(
      403,
    );
    expect((await call(helper, "PUT", "/api/rsvp", { attendance: yes(programItems) })).status).toBe(
      403,
    );
    expect((await ctx.app.inject({ url: "/api/rsvp" })).statusCode).toBe(401);
  });

  it("[CFG-03] the RSVP routes are unavailable while the rsvp feature is off", async () => {
    const { ctx, root, call, get, programItems, guest } = await setup();
    const anna = await guest("anna");
    ctx.event.setFeature("rsvp", false, "cli");
    expect((await get(anna, "/api/rsvp")).status).toBe(404);
    expect((await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems) })).status).toBe(
      404,
    );
    expect((await get(root, "/api/admin/rsvp")).status).toBe(404);
    ctx.event.setFeature("rsvp", true, "cli");
    expect((await get(anna, "/api/rsvp")).status).toBe(200);
  });
});

describe("the deadline", () => {
  it("[RSVP-04] a guest can change the RSVP until the deadline day is over", async () => {
    const { call, get, programItems, guest, root } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2999-01-01" });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body).toMatchObject({
      deadline: "2999-01-01",
      closed: false,
    });
    expect(
      (await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems, "Trauung") })).status,
    ).toBe(200);
  });

  it("[RSVP-04] after the deadline a guest cannot change the RSVP, but an admin can in admin mode", async () => {
    const { call, get, programItems, guest, root } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems, "Trauung") });
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2020-01-01" });

    const state = (await get<RsvpState>(anna, "/api/rsvp")).body;
    expect(state.closed).toBe(true);
    // The guest still sees the answer (read-only).
    expect(state.answer?.attendingItemIds).toEqual(ids(programItems, "Trauung"));
    const refused = await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Party"),
    });
    expect(refused.status).toBe(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe("rsvp_closed");

    const adminState = await get<RsvpState>(root, `/api/admin/rsvp/guests/${String(anna.id)}`);
    expect(adminState.body.answer?.attendingItemIds).toEqual(ids(programItems, "Trauung"));
    const changed = await call<RsvpState>(
      root,
      "PUT",
      `/api/admin/rsvp/guests/${String(anna.id)}`,
      {
        attendance: yes(programItems, "Party"),
      },
    );
    expect(changed.status).toBe(200);
    expect(changed.body?.answer?.attendingItemIds).toEqual(ids(programItems, "Party"));
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer?.attendingItemIds).toEqual(
      ids(programItems, "Party"),
    );

    // Admin mode is for admins and for guests only.
    expect(
      (
        await call(anna, "PUT", `/api/admin/rsvp/guests/${String(anna.id)}`, {
          attendance: yes(programItems),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(root, "PUT", `/api/admin/rsvp/guests/${String(root.id)}`, {
          attendance: yes(programItems),
        })
      ).status,
    ).toBe(409);
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/guests/999", { attendance: yes(programItems) }))
        .status,
    ).toBe(404);
  });

  it("[RSVP-04] every admin change is audited with ids only", async () => {
    const { ctx, call, programItems, guest, root, menus } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", `/api/admin/rsvp/guests/${String(anna.id)}`, {
      attendance: yes(programItems, "Dinner"),
      menuId: menus[0]?.id,
      allergies: "Zöliakie",
    });
    const entry = ctx.event.auditEntries().find((e) => e.action === "rsvp.admin_answer");
    expect(entry).toMatchObject({ actor: `user:${String(root.id)}`, details: { userId: anna.id } });
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("Zöliakie");
  });
});

describe("the admin overview", () => {
  it("[RSVP-05] shows totals per program item and menu, the guest table and who has not answered", async () => {
    const { get, call, programItems, guest, root, menus } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben", ids(programItems, "Apéro", "Dinner"));
    await guest("cleo");
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Apéro", "Dinner"),
      menuId: menus[0]?.id,
      allergies: "Nüsse",
      songWish: "ABBA",
    });
    await call(ben, "PUT", "/api/rsvp", {
      attendance: yes(
        programItems.filter((p) => ["Apéro", "Dinner"].includes(p.name)),
        "Apéro",
      ),
    });

    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(overview.answered).toBe(2);
    expect(overview.total).toBe(3);
    const total = (name: string) =>
      overview.totals.find((t) => t.programItemId === ids(programItems, name)[0]);
    expect(total("Trauung")).toMatchObject({ yes: 1, no: 0 });
    expect(total("Apéro")).toMatchObject({ yes: 2, no: 0 });
    expect(total("Dinner")).toMatchObject({ yes: 1, no: 1 });
    expect(total("Party")).toMatchObject({ yes: 0, no: 1 }); // only anna was invited, and said no
    expect(overview.menuTotals).toEqual([{ menuId: menus[0]?.id, count: 1 }]);
    expect(overview.guests.map((g) => [g.name, g.status])).toEqual([
      ["anna", "attending"],
      ["ben", "attending"],
      ["cleo", "none"],
    ]);
    expect(overview.guests[0]).toMatchObject({ allergies: "Nüsse", songWish: "ABBA" });
  });

  it("[RSVP-05] a guest who declined everything counts as answered but not attending", async () => {
    const { get, call, programItems, guest, root } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems) });
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(overview.guests[0]?.status).toBe("declined");
    expect(overview.answered).toBe(1);
    expect(overview.totals.every((t) => t.yes === 0 && t.no === 1)).toBe(true);
  });

  it("[SEC-11] allergies reach only admins and the guest's own answer", async () => {
    const { ctx, get, call, programItems, guest, root, menus } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben");
    const staff = await makeUser(ctx, "helfer", ["staff", "vip"]);
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Dinner"),
      menuId: menus[0]?.id,
      allergies: "GEHEIM-ALLERGIE",
    });

    expect((await get<RsvpState>(anna, "/api/rsvp")).raw.body).toContain("GEHEIM-ALLERGIE");
    for (const who of [ben, staff]) {
      expect((await get(who, "/api/admin/rsvp")).status).toBe(403);
      expect((await get(who, "/api/admin/rsvp/export")).status).toBe(403);
      expect((await get(who, `/api/admin/rsvp/guests/${String(anna.id)}`)).status).toBe(403);
      expect((await get<RsvpState>(who, "/api/rsvp")).raw.body).not.toContain("GEHEIM-ALLERGIE");
    }
    expect((await get(root, "/api/admin/rsvp")).raw.body).toContain("GEHEIM-ALLERGIE");
    // Neither the audit log nor the activity card hold the text.
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("GEHEIM-ALLERGIE");
    expect((await get(root, "/api/admin/activity")).raw.body).not.toContain("GEHEIM-ALLERGIE");
  });

  it("[RSVP-05] exports the guest table as CSV, safe against formulas", async () => {
    const { get, call, programItems, guest, root, menus } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Dinner"),
      menuId: menus[1]?.id,
      allergies: '=HYPERLINK("http://x")',
      songWish: 'Abba; Dancing "Queen"',
    });
    await guest("ben");
    const response = (await get(root, "/api/admin/rsvp/export")).raw;
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");
    const lines = response.body.trim().split("\r\n");
    expect(lines[0]).toBe("Name;Typ;Status;Trauung;Apéro;Dinner;Party;Menü;Songwunsch;Allergien");
    expect(lines[1]).toBe(
      'anna;Erwachsen;zugesagt;ja;nein;ja;nein;Vegetarisch;"Abba; Dancing ""Queen""";"\'=HYPERLINK(""http://x"")"',
    );
    expect(lines[2]).toBe("ben;Erwachsen;ohne Antwort;;;;;;;");
  });
});

describe("reminders", () => {
  function verify(ctx: TestContext, userId: number, email: string, status = "verified") {
    ctx.database.sqlite
      .prepare("UPDATE users SET email = ?, email_status = ? WHERE id = ?")
      .run(email, status, userId);
  }

  it("[RSVP-07] reminds only guests without an answer who have a verified address", async () => {
    const { ctx, call, get, programItems, guest, root } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben");
    const cleo = await guest("cleo");
    await guest("dora"); // no address at all
    verify(ctx, anna.id, "anna@example.ch");
    verify(ctx, ben.id, "ben@example.ch");
    verify(ctx, cleo.id, "cleo@example.ch", "unverified");
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems, "Trauung") });
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2999-05-01" });

    expect((await get<RsvpOverview>(root, "/api/admin/rsvp")).body.reminderCount).toBe(1);
    const sent = await call<{ sent: number }>(root, "POST", "/api/admin/rsvp/remind");
    expect(sent.body).toEqual({ sent: 1 });
    expect(ctx.mailer.sent.map((m) => m.to)).toEqual(["ben@example.ch"]);
    expect(ctx.mailer.sent[0]?.text).toContain("ben");
    expect(ctx.mailer.sent[0]?.text).toContain("http://localhost:5173/rsvp");
    expect(ctx.mailer.sent[0]?.text).toContain("2999-05-01");
  });

  it("[RSVP-07] a failing mail does not stop the others", async () => {
    const { ctx, call, guest, root } = await setup();
    for (const name of ["anna", "ben"]) verify(ctx, (await guest(name)).id, `${name}@example.ch`);
    ctx.mailer.failWith = new Error("smtp down");
    expect((await call<{ sent: number }>(root, "POST", "/api/admin/rsvp/remind")).body).toEqual({
      sent: 0,
    });
  });

  it("[RSVP-07] a double click or a second admin never mails the same guests twice", async () => {
    const { ctx, call, guest, root } = await setup();
    verify(ctx, (await guest("anna")).id, "anna@example.ch");
    const lea = await makeUser(ctx, "lea", ["admin"]);
    // Both requests arrive before the first one has sent its mails.
    const [first, second] = await Promise.all([
      call(root, "POST", "/api/admin/rsvp/remind"),
      call(root, "POST", "/api/admin/rsvp/remind"),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 429]);
    expect((await call(lea, "POST", "/api/admin/rsvp/remind")).status).toBe(429);
    expect(ctx.mailer.sent).toHaveLength(1);
    // After the window the next round goes out.
    ctx.auth.limiter.reset("rsvp-remind:event1");
    expect((await call(lea, "POST", "/api/admin/rsvp/remind")).status).toBe(200);
    expect(ctx.mailer.sent).toHaveLength(2);
  });

  it("[RSVP-07] only an admin sends reminders", async () => {
    const { call, guest } = await setup();
    const anna = await guest("anna");
    expect((await call(anna, "POST", "/api/admin/rsvp/remind")).status).toBe(403);
  });
});

describe("the activity card", () => {
  const latest = async (ctx: TestContext, root: SignedIn) => {
    const response = await ctx.app.inject({
      url: "/api/admin/activity",
      headers: { cookie: root.cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ entries: ActivityEntry[] }>().entries;
  };

  it("[DATA-05] lists guest-related changes with names resolved when displayed, newest first", async () => {
    const { ctx, root, call, programItems, guest } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2027-05-01" });
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems, "Trauung") });
    const entries = await latest(ctx, root);
    expect(entries.slice(0, 2).map((e) => [e.action, e.name])).toEqual([
      ["rsvp.answer", "anna"],
      ["rsvp.deadline", null],
    ]);
    // A renamed or deleted guest shows no stale name: the name is read when displayed.
    ctx.database.sqlite
      .prepare("UPDATE users SET display_name = 'Anna Neu' WHERE id = ?")
      .run(anna.id);
    expect((await latest(ctx, root))[0]?.name).toBe("Anna Neu");
    ctx.database.sqlite.prepare("DELETE FROM users WHERE id = ?").run(anna.id);
    expect((await latest(ctx, root))[0]?.name).toBeNull();
  });

  it("[DATA-05] lists changes to settings and content, but not logins or role changes", async () => {
    const { ctx, root, call, guest } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", `/api/admin/users/${String(anna.id)}/roles`, {
      roles: ["vip", "staff"],
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "root", password: PASSWORD },
    });
    await call(root, "PATCH", "/api/admin/event", { settings: { snapshotUploadsOpen: true } });
    const entries = await latest(ctx, root);
    expect(entries[0]).toMatchObject({ action: "setting.set", name: "snapshotUploadsOpen" });
    const actions = entries.map((e) => e.action);
    expect(actions).not.toContain("user.roles");
    expect(actions).not.toContain("session.login");
    // Of the account entries only the invited program items are listed: they are about the guest.
    expect(
      actions.every(
        (a) => a === "user.program_items" || (!a.startsWith("user.") && !a.startsWith("session.")),
      ),
    ).toBe(true);
  });

  it("[DATA-05] a batch of invitations is one entry with a count; a redeemed one names the guest", async () => {
    const { ctx, root, call } = await setup();
    const created = await call<{ invitations: IssuedInvitation[] }>(
      root,
      "POST",
      "/api/admin/invitations",
      {
        guests: [{ name: "Erika" }, { name: "Lukas" }, { name: "Familie Brunner" }],
      },
    );
    let entries = await latest(ctx, root);
    expect(entries.find((e) => e.action === "invitation.create")).toMatchObject({
      count: 3,
      name: null,
    });

    await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${created.body?.invitations[0]?.code ?? ""}/register`,
      payload: { username: "erika", password: PASSWORD },
    });
    entries = await latest(ctx, root);
    expect(entries[0]).toMatchObject({ action: "invitation.redeem", name: "Erika", count: 1 });
  });

  it("[DATA-05] shows the latest five entries, and only to admins", async () => {
    const { ctx, root, call, guest } = await setup();
    for (let i = 0; i < 4; i += 1) {
      await call(root, "PUT", "/api/admin/rsvp/deadline", {
        deadline: `2027-05-0${String(i + 1)}`,
      });
      await call(root, "POST", "/api/admin/rsvp/menus", { name: `Menü ${String(i)}` });
    }
    expect(await latest(ctx, root)).toHaveLength(5);
    const anna = await guest("anna");
    expect(
      (await ctx.app.inject({ url: "/api/admin/activity", headers: { cookie: anna.cookie } }))
        .statusCode,
    ).toBe(403);
    expect((await ctx.app.inject({ url: "/api/admin/activity" })).statusCode).toBe(401);
  });
});

describe("the song wish switch", () => {
  it("[RSVP-06] the song wish is on by default; the admin switches it off and on, only admins", async () => {
    const { root, call, get, guest } = await setup();
    const anna = await guest("anna");
    expect(
      (await get<{ songEnabled: boolean }>(root, "/api/admin/rsvp/config")).body.songEnabled,
    ).toBe(true);
    expect((await call(anna, "PUT", "/api/admin/rsvp/song", { enabled: false })).status).toBe(403);
    expect((await call(root, "PUT", "/api/admin/rsvp/song", { enabled: "no" })).status).toBe(400);
    expect((await call(root, "PUT", "/api/admin/rsvp/song", { enabled: false })).status).toBe(204);
    expect(
      (await get<{ songEnabled: boolean }>(root, "/api/admin/rsvp/config")).body.songEnabled,
    ).toBe(false);
    expect(
      (await get<RsvpState & { songEnabled: boolean }>(anna, "/api/rsvp")).body.songEnabled,
    ).toBe(false);
    expect((await call(root, "PUT", "/api/admin/rsvp/song", { enabled: true })).status).toBe(204);
    expect(
      (await get<RsvpState & { songEnabled: boolean }>(anna, "/api/rsvp")).body.songEnabled,
    ).toBe(true);
  });

  it("[RSVP-06] while it is off no song wish is taken, an earlier one stays, and it is not exported", async () => {
    const { get, call, programItems, guest, root } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben");
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung"),
      songWish: "ABBA",
    });
    await call(root, "PUT", "/api/admin/rsvp/song", { enabled: false });

    // Ben cannot slip a wish in; Anna changes her answer and keeps hers.
    await call(ben, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung"),
      songWish: "Queen",
    });
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(programItems, "Trauung", "Party") });
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(overview.songEnabled).toBe(false);
    expect(overview.guests.map((g) => [g.name, g.songWish])).toEqual([
      ["anna", "ABBA"],
      ["ben", null],
    ]);
    const header = (await get(root, "/api/admin/rsvp/export")).raw.body.split("\r\n")[0];
    expect(header).toBe("Name;Typ;Status;Trauung;Apéro;Dinner;Party;Menü;Allergien");

    // Switched on again, the wish is there and can be changed.
    await call(root, "PUT", "/api/admin/rsvp/song", { enabled: true });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer?.songWish).toBe("ABBA");
    expect((await get(root, "/api/admin/rsvp/export")).raw.body.split("\r\n")[0]).toContain(
      "Songwunsch",
    );
  });

  it("[DATA-05] switching the song wish is audited and shows on the card Zuletzt", async () => {
    const { ctx, root, call } = await setup();
    await call(root, "PUT", "/api/admin/rsvp/song", { enabled: false });
    // Switching to the same value changes and logs nothing.
    await call(root, "PUT", "/api/admin/rsvp/song", { enabled: false });
    expect(ctx.event.auditEntries().filter((e) => e.action === "rsvp.song")).toHaveLength(1);
    const response = await ctx.app.inject({
      url: "/api/admin/activity",
      headers: { cookie: root.cookie },
    });
    expect(response.json<{ entries: ActivityEntry[] }>().entries[0]?.action).toBe("rsvp.song");
  });
});

describe("answers after the invitation changes (7.4.1, decided 2026-11-11)", () => {
  const guestRow = (overview: RsvpOverview, userId: number) =>
    must(overview.guests.find((g) => g.userId === userId));
  const total = (overview: RsvpOverview, programItemId: number | undefined) =>
    must(overview.totals.find((t) => t.programItemId === programItemId));

  it("[RSVP-02] removing a program item from a redeemed invitation removes the answer for it", async () => {
    const { ctx, root, call, get, programItems } = await setup();
    const zora = await makeUser(ctx, "zora", []);
    const [issued] = ctx.auth.invitations.create([{ name: "Zora" }], undefined, "cli");
    const invitation = must(issued);
    ctx.auth.invitations.redeemForUser(invitation.code, zora.id);
    await call(zora, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Party"),
    });
    const [trauung, , , party] = ids(programItems, "Trauung", "Apéro", "Dinner", "Party");

    const changed = await call(root, "PUT", `/api/admin/users/${String(zora.id)}/program-items`, {
      programItemIds: ids(programItems, "Trauung", "Apéro"),
    });
    expect(changed.status).toBe(200);
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(guestRow(overview, zora.id).attendingItemIds).toEqual([trauung]);
    expect(total(overview, party)).toEqual({
      programItemId: party,
      yes: 0,
      no: 0,
      yesByType: { adult: 0, child: 0 },
    });
    const state = (await get<RsvpState>(zora, "/api/rsvp")).body;
    expect(state.answer?.attendingItemIds).toEqual([trauung]);
  });

  it("[RSVP-02][RSVP-05] a program item added after the answer is not answered yet: no totals, an empty CSV cell", async () => {
    const { root, call, get, programItems, guest } = await setup();
    const [trauung, apero] = ids(programItems, "Trauung", "Apéro");
    const anna = await guest("anna", [must(trauung)]);
    const ben = await guest("ben", [must(trauung)]);
    await call(anna, "PUT", "/api/rsvp", {
      attendance: [{ programItemId: trauung, attending: true }],
    });
    await call(ben, "PUT", "/api/rsvp", {
      attendance: [{ programItemId: trauung, attending: false }],
    });
    for (const who of [anna, ben]) {
      await call(root, "PUT", `/api/admin/users/${String(who.id)}/program-items`, {
        programItemIds: [trauung, apero],
      });
    }

    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(total(overview, apero)).toEqual({
      programItemId: apero,
      yes: 0,
      no: 0,
      yesByType: { adult: 0, child: 0 },
    });
    // Anna still attends; Ben declined the rest and has no answer for the new program item.
    expect(guestRow(overview, anna.id)).toMatchObject({
      status: "attending",
      declinedItemIds: [],
    });
    expect(guestRow(overview, ben.id)).toMatchObject({
      status: "none",
      declinedItemIds: [trauung],
    });
    const csv = (await get(root, "/api/admin/rsvp/export")).raw.body.split("\r\n");
    expect(csv.find((line) => line.startsWith("anna;"))).toMatch(/^anna;Erwachsen;zugesagt;ja;;;;/);
    expect(csv.find((line) => line.startsWith("ben;"))).toMatch(
      /^ben;Erwachsen;ohne Antwort;nein;;;;/,
    );
    // The guest's state tells the wizard which program item is open.
    const state = (await get<RsvpState>(ben, "/api/rsvp")).body;
    expect(state.answer).toMatchObject({ attendingItemIds: [], declinedItemIds: [trauung] });
  });

  it("[RSVP-02] a guest whose only yes disappears goes back to no answer", async () => {
    const { root, call, get, programItems, menus, guest } = await setup();
    const [trauung, dinner] = ids(programItems, "Trauung", "Dinner");
    const anna = await guest("anna", [must(trauung), must(dinner)]);
    await call(anna, "PUT", "/api/rsvp", {
      attendance: [
        { programItemId: trauung, attending: false },
        { programItemId: dinner, attending: true },
      ],
      menuId: menus[0]?.id,
      allergies: "Nüsse",
    });
    // The program item is deleted: the guest attends nothing they answered with yes.
    expect(
      (await call(root, "DELETE", `/api/admin/rsvp/program-items/${String(dinner)}`)).status,
    ).toBe(204);
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(guestRow(overview, anna.id)).toMatchObject({
      status: "none",
      attendingItemIds: [],
      declinedItemIds: [],
      menuId: null,
      allergies: null,
    });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer).toBeNull();
  });

  it("[RSVP-09] a companion whose only yes is removed from the invitation goes back to no answer", async () => {
    const { root, call, get, programItems, guest } = await setup();
    const [trauung, party] = ids(programItems, "Trauung", "Party");
    const anna = await guest("anna", [must(trauung), must(party)]);
    const attendance = [
      { programItemId: trauung, attending: true },
      { programItemId: party, attending: false },
    ];
    await call(anna, "PUT", "/api/rsvp", { attendance });
    const made = await call<RsvpState>(anna, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "adult",
      attendance: [
        { programItemId: trauung, attending: false },
        { programItemId: party, attending: true },
      ],
      allergies: "Laktose",
    });
    const mia = must(made.body?.companions[0]);
    await call(root, "PUT", `/api/admin/users/${String(anna.id)}/program-items`, {
      programItemIds: [trauung],
    });
    const state = (await get<RsvpState>(anna, "/api/rsvp")).body;
    // Anna keeps her yes; Mia's answer is gone, so the wizard asks for it again.
    expect(state.answer?.attendingItemIds).toEqual([trauung]);
    expect(state.companions.find((c) => c.id === mia.id)).toMatchObject({
      attendingItemIds: [],
      declinedItemIds: [],
      allergies: null,
    });
  });

  it("[RSVP-02][SEC-11] revoking vip deletes the answer, the allergies and the companions", async () => {
    const { ctx, root, call, get, programItems, guest } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung"),
      allergies: "Nüsse",
    });
    await call(anna, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "adult",
      attendance: yes(programItems, "Trauung"),
      allergies: "Laktose",
    });
    const revoked = await call(root, "PUT", `/api/admin/users/${String(anna.id)}/roles`, {
      roles: [],
    });
    expect(revoked.status).toBe(200);
    const count = (table: string) =>
      (
        ctx.database.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
          n: number;
        }
      ).n;
    for (const table of [
      "rsvp_answers",
      "rsvp_attendance",
      "companions",
      "companion_attendance",
      "membership_program_items",
    ]) {
      expect(count(table), table).toBe(0);
    }
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(overview.pendingCount).toBe(0);
    // Made a guest again, the account starts without an answer.
    await call(root, "PUT", `/api/admin/users/${String(anna.id)}/roles`, { roles: ["vip"] });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body).toMatchObject({
      answer: null,
      companions: [],
    });
  });

  it("[RSVP-09] the navigation badge reads the number of pending requests alone", async () => {
    const { root, call, get, programItems, guest } = await setup();
    const anna = await guest("anna");
    await call(anna, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "adult",
      attendance: yes(programItems, "Trauung"),
    });
    const pending = await get<{ pendingCount: number }>(root, "/api/admin/rsvp/pending");
    expect(pending.body).toEqual({ pendingCount: 1, companionApproval: true });
    expect((await get(anna, "/api/admin/rsvp/pending")).status).toBe(403);
  });
});

describe("one answer or one per program item (RSVP-11, 7.4.2)", () => {
  interface Config {
    perItem: boolean;
  }

  it("[RSVP-11] one answer per person is the default; an answer must be the same yes or no for every program item", async () => {
    const ctx = await createTestApp();
    context = ctx;
    const root0 = await makeUser(ctx, "root", ["admin"]);
    const config = await ctx.app.inject({
      url: "/api/admin/rsvp/config",
      headers: { cookie: root0.cookie },
    });
    expect(config.json<Config>().perItem).toBe(false);
    await ctx.close();
    context = undefined;

    const { call, get, programItems, guest, root } = await setup();
    await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: false });
    const erika = await guest("erika");
    const mixed = await call(erika, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Apéro"),
    });
    expect(mixed.status).toBe(400);
    expect((mixed.body as { error: { code: string } }).error.code).toBe("invalid_attendance");
    const menuId = must((await get<RsvpState>(erika, "/api/rsvp")).body.menus[0]).id;
    const everything = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Apéro", "Dinner", "Party"),
      menuId,
    });
    expect(everything.status).toBe(200);
    const nothing = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: yes(programItems),
    });
    expect(nothing.status).toBe(200);
  });

  it("[RSVP-11] the answer is stored per program item; a program item added later takes the existing answer", async () => {
    const { call, get, programItems, menus, guest, root } = await setup();
    await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: false });
    const [trauung, apero, dinner, party] = programItems;
    const invited = [must(trauung).id, must(apero).id];
    const erika = await guest("erika", invited);
    const nina = await guest("nina", invited);
    const lukas = await guest("lukas", invited);
    const answer = (who: SignedIn, yesOrNo: boolean) =>
      call<RsvpState>(who, "PUT", "/api/rsvp", {
        attendance: invited.map((programItemId) => ({ programItemId, attending: yesOrNo })),
      });
    expect((await answer(erika, true)).status).toBe(200);
    expect((await answer(nina, false)).status).toBe(200);
    // A companion of erika answers yes as well.
    const added = await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "adult",
      attendance: invited.map((programItemId) => ({ programItemId, attending: true })),
    });
    expect(added.status).toBe(201);

    // The admin adds Dinner and Party to the invitations (lukas has not answered).
    const all = [...invited, must(dinner).id, must(party).id];
    for (const who of [erika, nina, lukas]) {
      await call(root, "PUT", `/api/admin/users/${String(who.id)}/program-items`, {
        programItemIds: all,
      });
    }
    const erikaState = (await get<RsvpState>(erika, "/api/rsvp")).body;
    expect(erikaState.answer?.attendingItemIds).toEqual(all);
    expect(erikaState.answer?.declinedItemIds).toEqual([]);
    expect(erikaState.companions[0]?.attendingItemIds).toEqual(all);
    // Dinner is the meal item: the new yes asks for a menu the next time; the status stays.
    expect(erikaState.answer?.menuId).toBeNull();
    expect(menus.length).toBeGreaterThan(0);
    const ninaState = (await get<RsvpState>(nina, "/api/rsvp")).body;
    expect(ninaState.answer?.declinedItemIds).toEqual(all);
    // Someone who has not answered stays unanswered: nothing is made up for them.
    const lukasState = (await get<RsvpState>(lukas, "/api/rsvp")).body;
    expect(lukasState.answer).toBeNull();
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    // erika says yes and nina no for every program item, also for the new ones; the companion
    // is still pending (approval is on in this setup) and does not count.
    expect(overview.totals.map((t) => [t.yes, t.no])).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
  });

  it("[RSVP-11] switching to one answer keeps what is stored until the next save", async () => {
    const { ctx, call, get, programItems, menus, guest, root } = await setup();
    const erika = await guest("erika");
    const mixed = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Dinner"),
      menuId: menus[0]?.id,
    });
    expect(mixed.status).toBe(200);
    expect((await get<Config>(root, "/api/admin/rsvp/config")).body.perItem).toBe(true);

    expect((await call(erika, "PUT", "/api/admin/rsvp/per-item", { enabled: false })).status).toBe(
      403,
    );
    expect((await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: 1 })).status).toBe(400);
    expect((await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: false })).status).toBe(
      204,
    );
    // Nothing is rewritten by the switch itself.
    const stored = (await get<RsvpState>(erika, "/api/rsvp")).body;
    expect(stored.perItem).toBe(false);
    expect(stored.answer?.attendingItemIds).toHaveLength(2);
    expect(stored.answer?.declinedItemIds).toHaveLength(2);
    // The next save is one answer for all.
    const next = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: yes(programItems, "Trauung", "Apéro", "Dinner", "Party"),
      menuId: menus[0]?.id,
    });
    expect(next.body?.answer?.attendingItemIds).toHaveLength(4);
    const entry = ctx.event.auditEntries().find((e) => e.action === "rsvp.per_item");
    expect(entry?.details).toEqual({ to: false });
  });
});
