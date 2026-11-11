import { afterEach, describe, expect, it } from "vitest";
import type {
  ActivityEntry,
  EventPart,
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

/** A set-up event with an admin, the parts Trauung, Apéro, Dinner (meal), Party and two menus. */
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
  const parts: EventPart[] = [];
  for (const [name, hour, hasMeal] of [
    ["Trauung", 14, false],
    ["Apéro", 15, false],
    ["Dinner", 18, true],
    ["Party", 22, false],
  ] as const) {
    const made = await call<EventPart>(root, "POST", "/api/admin/rsvp/parts", {
      name,
      startsAt: `2027-06-12T${String(hour)}:00:00.000Z`,
      place: "Linde",
      hasMeal,
    });
    expect(made.status).toBe(201);
    parts.push(must(made.body));
  }
  const menus: MenuOption[] = [];
  for (const name of ["Fleisch", "Vegetarisch"]) {
    const made = await call<MenuOption>(root, "POST", "/api/admin/rsvp/menus", { name });
    menus.push(must(made.body));
  }
  /** A guest account, invited to the given parts (default: all four). */
  const guest = async (username: string, partIds = parts.map((p) => p.id)) => {
    const who = await makeUser(ctx, username, ["vip"]);
    await call(root, "PUT", `/api/admin/users/${String(who.id)}/parts`, { partIds });
    return who;
  };
  return { ctx, root, call, get, parts, menus, guest };
}

const ids = (parts: EventPart[], ...names: string[]) =>
  parts.filter((p) => names.includes(p.name)).map((p) => p.id);
const yes = (parts: EventPart[], ...names: string[]) =>
  parts.map((p) => ({ partId: p.id, attending: names.includes(p.name) }));

describe("event parts, menus and the deadline", () => {
  it("[RSVP-02] the admin creates, changes and deletes event parts; at most one has the meal", async () => {
    const { root, call, get, parts } = await setup();
    const config = (await get<{ parts: EventPart[] }>(root, "/api/admin/rsvp/config")).body;
    expect(config.parts.map((p) => p.name)).toEqual(["Trauung", "Apéro", "Dinner", "Party"]);
    expect(config.parts.filter((p) => p.hasMeal).map((p) => p.name)).toEqual(["Dinner"]);

    // Marking another part moves the meal.
    const apero = must(parts.find((p) => p.name === "Apéro"));
    const moved = await call<EventPart>(
      root,
      "PATCH",
      `/api/admin/rsvp/parts/${String(apero.id)}`,
      {
        hasMeal: true,
      },
    );
    expect(moved.body?.hasMeal).toBe(true);
    const after = (await get<{ parts: EventPart[] }>(root, "/api/admin/rsvp/config")).body;
    expect(after.parts.filter((p) => p.hasMeal).map((p) => p.name)).toEqual(["Apéro"]);

    // Parts are ordered by time, not by creation.
    await call(root, "PATCH", `/api/admin/rsvp/parts/${String(apero.id)}`, {
      startsAt: "2027-06-12T10:00:00.000Z",
      place: null,
    });
    const reordered = (await get<{ parts: EventPart[] }>(root, "/api/admin/rsvp/config")).body;
    expect(reordered.parts[0]?.name).toBe("Apéro");
    expect(reordered.parts[0]?.place).toBeNull();

    expect((await call(root, "DELETE", `/api/admin/rsvp/parts/${String(apero.id)}`)).status).toBe(
      204,
    );
    expect((await call(root, "DELETE", `/api/admin/rsvp/parts/${String(apero.id)}`)).status).toBe(
      404,
    );
    expect((await call(root, "PATCH", "/api/admin/rsvp/parts/999", { name: "X" })).status).toBe(
      404,
    );
  });

  it("[RSVP-02][RSVP-03] input is validated and only admins change the configuration", async () => {
    const { ctx, root, call, guest } = await setup();
    expect(
      (await call(root, "POST", "/api/admin/rsvp/parts", { name: "", startsAt: "x" })).status,
    ).toBe(400);
    expect((await call(root, "POST", "/api/admin/rsvp/menus", { name: " " })).status).toBe(400);
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "1. Mai" })).status,
    ).toBe(400);
    const anna = await guest("anna");
    for (const [method, url, payload] of [
      ["POST", "/api/admin/rsvp/parts", { name: "X", startsAt: "2027-06-12T10:00:00.000Z" }],
      ["POST", "/api/admin/rsvp/menus", { name: "X" }],
      ["PUT", "/api/admin/rsvp/deadline", { deadline: null }],
      ["PUT", "/api/admin/users/1/parts", { partIds: [] }],
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

describe("invited parts", () => {
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

  it("[RSVP-02] an invitation carries its parts, all parts by default, and the guest gets them", async () => {
    const { ctx, root, get, parts } = await setup();
    const some = await invite(ctx, root, { partIds: ids(parts, "Apéro", "Dinner") });
    const all = await invite(ctx, root, {});
    expect(some.partIds).toEqual(ids(parts, "Apéro", "Dinner"));
    expect(all.partIds).toEqual(parts.map((p) => p.id));

    expect((await redeem(ctx, some.code, "erika")).statusCode).toBe(201);
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "erika", password: PASSWORD },
    });
    const cookie = `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ""}`;
    const state = (await get<RsvpState>({ cookie, csrf: "", id: 0 }, "/api/rsvp")).body;
    expect(state.parts.map((p) => p.name)).toEqual(["Apéro", "Dinner"]);
    expect(state.name).toBe("Erika Huber");

    // The invitation list shows the parts of the account once redeemed.
    const list = (
      await get<{ invitations: { id: number; partIds: number[] }[] }>(
        root,
        "/api/admin/invitations",
      )
    ).body;
    expect(list.invitations.find((i) => i.id === some.id)?.partIds).toEqual(
      ids(parts, "Apéro", "Dinner"),
    );
  });

  it("[RSVP-02] an unknown part is refused when creating an invitation", async () => {
    const { ctx, root } = await setup();
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/invitations",
      headers: as(root),
      payload: { guests: [{ name: "X" }], partIds: [999] },
    });
    expect(response.statusCode).toBe(404);
  });

  it("[RSVP-02] the admin changes the parts per invitation, before and after it is redeemed; a regenerated code keeps them", async () => {
    const { ctx, root, call, get, parts } = await setup();
    const first = await invite(ctx, root, { partIds: ids(parts, "Trauung") });
    const changed = await call<{ partIds: number[] }>(
      root,
      "PUT",
      `/api/admin/invitations/${String(first.id)}/parts`,
      { partIds: ids(parts, "Trauung", "Dinner") },
    );
    expect(changed.body?.partIds).toEqual(ids(parts, "Trauung", "Dinner"));

    const regenerated = await call<IssuedInvitation>(
      root,
      "POST",
      `/api/admin/invitations/${String(first.id)}/regenerate`,
    );
    expect(regenerated.body?.partIds).toEqual(ids(parts, "Trauung", "Dinner"));
    // The replaced code is dead and cannot be changed any more.
    expect(
      (await call(root, "PUT", `/api/admin/invitations/${String(first.id)}/parts`, { partIds: [] }))
        .status,
    ).toBe(409);

    const code = must(regenerated.body);
    await redeem(ctx, code.code, "erika");
    const after = await call<{ partIds: number[] }>(
      root,
      "PUT",
      `/api/admin/invitations/${String(code.id)}/parts`,
      { partIds: ids(parts, "Party") },
    );
    expect(after.body?.partIds).toEqual(ids(parts, "Party"));
    const users = (
      await get<{ users: { username: string; invitedPartIds: number[] }[] }>(
        root,
        "/api/admin/users",
      )
    ).body.users;
    expect(users.find((u) => u.username === "erika")?.invitedPartIds).toEqual(ids(parts, "Party"));
  });

  it("[RSVP-02] a vip made by an admin is invited to all parts; revoking vip clears them", async () => {
    const { ctx, root, call, get, parts } = await setup();
    const created = await call<{ user: { id: number } }>(root, "POST", "/api/admin/users", {
      username: "oma",
      roles: ["vip"],
    });
    const id = created.body?.user.id ?? 0;
    const users = () =>
      get<{ users: { id: number; invitedPartIds: number[] }[] }>(root, "/api/admin/users").then(
        (r) => r.body.users.find((u) => u.id === id)?.invitedPartIds,
      );
    expect(await users()).toEqual(parts.map((p) => p.id));

    // The account panel changes them; unknown parts are refused.
    await call(root, "PUT", `/api/admin/users/${String(id)}/parts`, {
      partIds: ids(parts, "Dinner"),
    });
    expect(await users()).toEqual(ids(parts, "Dinner"));
    expect(
      (await call(root, "PUT", `/api/admin/users/${String(id)}/parts`, { partIds: [999] })).status,
    ).toBe(404);

    // A user without vip has no parts; promoting through the roles gives all parts.
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    expect(
      (await call(root, "PUT", `/api/admin/users/${String(helper.id)}/parts`, { partIds: [] }))
        .status,
    ).toBe(409);
    await call(root, "PUT", `/api/admin/users/${String(helper.id)}/roles`, {
      roles: ["staff", "vip"],
    });
    const helperParts = (
      await get<{ users: { id: number; invitedPartIds: number[] }[] }>(root, "/api/admin/users")
    ).body.users.find((u) => u.id === helper.id)?.invitedPartIds;
    expect(helperParts).toEqual(parts.map((p) => p.id));
    await call(root, "PUT", `/api/admin/users/${String(helper.id)}/roles`, { roles: ["staff"] });
    const cleared = (
      await get<{ users: { id: number; invitedPartIds: number[] }[] }>(root, "/api/admin/users")
    ).body.users.find((u) => u.id === helper.id)?.invitedPartIds;
    expect(cleared).toEqual([]);
  });
});

describe("answering the RSVP", () => {
  it("[RSVP-01] a guest sees only the parts they are invited to and answers yes or no for each", async () => {
    const { get, call, parts, guest, menus } = await setup();
    const anna = await guest("anna", ids(parts, "Apéro", "Dinner"));
    const state = (await get<RsvpState>(anna, "/api/rsvp")).body;
    expect(state.parts.map((p) => p.name)).toEqual(["Apéro", "Dinner"]);
    expect(state.answer).toBeNull();
    expect(state.menus.map((m) => m.name)).toEqual(["Fleisch", "Vegetarisch"]);
    expect(state.closed).toBe(false);

    const saved = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(
        parts.filter((p) => ["Apéro", "Dinner"].includes(p.name)),
        "Apéro",
        "Dinner",
      ),
      menuId: menus[1]?.id,
    });
    expect(saved.status).toBe(200);
    expect(saved.body?.answer?.attendingPartIds).toEqual(ids(parts, "Apéro", "Dinner"));
    expect(saved.body?.answer?.menuId).toBe(menus[1]?.id);

    // Changing the answer replaces it.
    const changed = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(
        parts.filter((p) => ["Apéro", "Dinner"].includes(p.name)),
        "Apéro",
      ),
    });
    expect(changed.body?.answer?.attendingPartIds).toEqual(ids(parts, "Apéro"));
    expect(changed.body?.answer?.menuId).toBeNull();
  });

  it("[RSVP-01] every invited part must be answered once, and no other part", async () => {
    const { call, parts, guest } = await setup();
    const anna = await guest("anna", ids(parts, "Apéro", "Dinner"));
    const [apero, dinner, trauung] = [
      must(parts.find((p) => p.name === "Apéro")),
      must(parts.find((p) => p.name === "Dinner")),
      must(parts.find((p) => p.name === "Trauung")),
    ];
    const attempt = async (attendance: unknown) =>
      (await call(anna, "PUT", "/api/rsvp", { attendance })).status;
    expect(await attempt([{ partId: apero.id, attending: true }])).toBe(400); // Dinner missing
    expect(
      await attempt([
        { partId: apero.id, attending: true },
        { partId: dinner.id, attending: false },
        { partId: trauung.id, attending: true },
      ]),
    ).toBe(400); // not invited
    expect(
      await attempt([
        { partId: apero.id, attending: true },
        { partId: apero.id, attending: false },
      ]),
    ).toBe(400); // twice
    expect(await attempt("yes")).toBe(400);
  });

  it("[RSVP-03] the menu is asked only for guests attending the meal part, and then it is required", async () => {
    const { call, get, parts, guest, menus } = await setup();
    const anna = await guest("anna");
    const put = (body: Record<string, unknown>) => call<RsvpState>(anna, "PUT", "/api/rsvp", body);

    // Attending the dinner without a menu choice.
    const missing = await put({ attendance: yes(parts, "Dinner") });
    expect(missing.status).toBe(400);
    expect((missing.body as unknown as { error: { code: string } }).error.code).toBe(
      "menu_required",
    );
    expect((await put({ attendance: yes(parts, "Dinner"), menuId: 999 })).status).toBe(400);

    const ok = await put({
      attendance: yes(parts, "Dinner", "Party"),
      menuId: menus[0]?.id,
      allergies: "Nüsse",
      songWish: "ABBA – Dancing Queen",
    });
    expect(ok.body?.answer).toMatchObject({ menuId: menus[0]?.id, allergies: "Nüsse" });

    // Not attending the meal: no menu is asked and a chosen one is not kept.
    const noMeal = await put({ attendance: yes(parts, "Trauung", "Party"), menuId: menus[0]?.id });
    expect(noMeal.status).toBe(200);
    expect(noMeal.body?.answer?.menuId).toBeNull();
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer?.menuId).toBeNull();
  });

  it("[RSVP-03] without menu options, or without a meal part, nobody has to choose", async () => {
    const { root, call, parts, guest, menus } = await setup();
    const anna = await guest("anna");
    for (const menu of menus)
      await call(root, "DELETE", `/api/admin/rsvp/menus/${String(menu.id)}`);
    expect(
      (await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts, "Dinner") })).status,
    ).toBe(200);
  });

  it("[RSVP-06] the song wish is optional; declining every part keeps no menu, allergies or song wish", async () => {
    const { call, get, parts, guest, menus } = await setup();
    const anna = await guest("anna");
    const first = await call<RsvpState>(anna, "PUT", "/api/rsvp", {
      attendance: yes(parts, "Trauung"),
    });
    expect(first.body?.answer?.songWish).toBeNull();
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(parts, "Dinner"),
      menuId: menus[0]?.id,
      allergies: "Laktose",
      songWish: "Queen",
    });
    const declined = await call<RsvpState>(anna, "PUT", "/api/rsvp", { attendance: yes(parts) });
    expect(declined.body?.answer).toMatchObject({
      attendingPartIds: [],
      menuId: null,
      allergies: null,
      songWish: null,
    });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer).not.toBeNull();
    expect(
      (
        await call(anna, "PUT", "/api/rsvp", {
          attendance: yes(parts, "Trauung"),
          songWish: "x".repeat(201),
        })
      ).status,
    ).toBe(400);
  });

  it("[RSVP-01] only guests answer: an admin or staff member without vip has no RSVP", async () => {
    const { ctx, root, call, parts } = await setup();
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    expect((await call(root, "PUT", "/api/rsvp", { attendance: yes(parts) })).status).toBe(403);
    expect((await call(helper, "PUT", "/api/rsvp", { attendance: yes(parts) })).status).toBe(403);
    expect((await ctx.app.inject({ url: "/api/rsvp" })).statusCode).toBe(401);
  });

  it("[CFG-03] the RSVP routes are unavailable while the rsvp feature is off", async () => {
    const { ctx, root, call, get, parts, guest } = await setup();
    const anna = await guest("anna");
    ctx.event.setFeature("rsvp", false, "cli");
    expect((await get(anna, "/api/rsvp")).status).toBe(404);
    expect((await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts) })).status).toBe(404);
    expect((await get(root, "/api/admin/rsvp")).status).toBe(404);
    ctx.event.setFeature("rsvp", true, "cli");
    expect((await get(anna, "/api/rsvp")).status).toBe(200);
  });
});

describe("the deadline", () => {
  it("[RSVP-04] a guest can change the RSVP until the deadline day is over", async () => {
    const { call, get, parts, guest, root } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2999-01-01" });
    expect((await get<RsvpState>(anna, "/api/rsvp")).body).toMatchObject({
      deadline: "2999-01-01",
      closed: false,
    });
    expect(
      (await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts, "Trauung") })).status,
    ).toBe(200);
  });

  it("[RSVP-04] after the deadline a guest cannot change the RSVP, but an admin can in admin mode", async () => {
    const { call, get, parts, guest, root } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts, "Trauung") });
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2020-01-01" });

    const state = (await get<RsvpState>(anna, "/api/rsvp")).body;
    expect(state.closed).toBe(true);
    // The guest still sees the answer (read-only).
    expect(state.answer?.attendingPartIds).toEqual(ids(parts, "Trauung"));
    const refused = await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts, "Party") });
    expect(refused.status).toBe(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe("rsvp_closed");

    const adminState = await get<RsvpState>(root, `/api/admin/rsvp/guests/${String(anna.id)}`);
    expect(adminState.body.answer?.attendingPartIds).toEqual(ids(parts, "Trauung"));
    const changed = await call<RsvpState>(
      root,
      "PUT",
      `/api/admin/rsvp/guests/${String(anna.id)}`,
      {
        attendance: yes(parts, "Party"),
      },
    );
    expect(changed.status).toBe(200);
    expect(changed.body?.answer?.attendingPartIds).toEqual(ids(parts, "Party"));
    expect((await get<RsvpState>(anna, "/api/rsvp")).body.answer?.attendingPartIds).toEqual(
      ids(parts, "Party"),
    );

    // Admin mode is for admins and for guests only.
    expect(
      (
        await call(anna, "PUT", `/api/admin/rsvp/guests/${String(anna.id)}`, {
          attendance: yes(parts),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(root, "PUT", `/api/admin/rsvp/guests/${String(root.id)}`, {
          attendance: yes(parts),
        })
      ).status,
    ).toBe(409);
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/guests/999", { attendance: yes(parts) })).status,
    ).toBe(404);
  });

  it("[RSVP-04] every admin change is audited with ids only", async () => {
    const { ctx, call, parts, guest, root, menus } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", `/api/admin/rsvp/guests/${String(anna.id)}`, {
      attendance: yes(parts, "Dinner"),
      menuId: menus[0]?.id,
      allergies: "Zöliakie",
    });
    const entry = ctx.event.auditEntries().find((e) => e.action === "rsvp.admin_answer");
    expect(entry).toMatchObject({ actor: `user:${String(root.id)}`, details: { userId: anna.id } });
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("Zöliakie");
  });
});

describe("the admin overview", () => {
  it("[RSVP-05] shows totals per part and menu, the guest table and who has not answered", async () => {
    const { get, call, parts, guest, root, menus } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben", ids(parts, "Apéro", "Dinner"));
    await guest("cleo");
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(parts, "Trauung", "Apéro", "Dinner"),
      menuId: menus[0]?.id,
      allergies: "Nüsse",
      songWish: "ABBA",
    });
    await call(ben, "PUT", "/api/rsvp", {
      attendance: yes(
        parts.filter((p) => ["Apéro", "Dinner"].includes(p.name)),
        "Apéro",
      ),
    });

    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(overview.answered).toBe(2);
    expect(overview.total).toBe(3);
    const total = (name: string) => overview.totals.find((t) => t.partId === ids(parts, name)[0]);
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
    const { get, call, parts, guest, root } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts) });
    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    expect(overview.guests[0]?.status).toBe("declined");
    expect(overview.answered).toBe(1);
    expect(overview.totals.every((t) => t.yes === 0 && t.no === 1)).toBe(true);
  });

  it("[SEC-11] allergies reach only admins and the guest's own answer", async () => {
    const { ctx, get, call, parts, guest, root, menus } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben");
    const staff = await makeUser(ctx, "helfer", ["staff", "vip"]);
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(parts, "Dinner"),
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
    const { get, call, parts, guest, root, menus } = await setup();
    const anna = await guest("anna");
    await call(anna, "PUT", "/api/rsvp", {
      attendance: yes(parts, "Trauung", "Dinner"),
      menuId: menus[1]?.id,
      allergies: '=HYPERLINK("http://x")',
      songWish: 'Abba; Dancing "Queen"',
    });
    await guest("ben");
    const response = (await get(root, "/api/admin/rsvp/export")).raw;
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");
    const lines = response.body.trim().split("\r\n");
    expect(lines[0]).toBe("Name;Status;Trauung;Apéro;Dinner;Party;Menü;Songwunsch;Allergien");
    expect(lines[1]).toBe(
      'anna;zugesagt;ja;nein;ja;nein;Vegetarisch;"Abba; Dancing ""Queen""";"\'=HYPERLINK(""http://x"")"',
    );
    expect(lines[2]).toBe("ben;ohne Antwort;;;;;;;");
  });
});

describe("reminders", () => {
  function verify(ctx: TestContext, userId: number, email: string, status = "verified") {
    ctx.database.sqlite
      .prepare("UPDATE users SET email = ?, email_status = ? WHERE id = ?")
      .run(email, status, userId);
  }

  it("[RSVP-07] reminds only guests without an answer who have a verified address", async () => {
    const { ctx, call, get, parts, guest, root } = await setup();
    const anna = await guest("anna");
    const ben = await guest("ben");
    const cleo = await guest("cleo");
    await guest("dora"); // no address at all
    verify(ctx, anna.id, "anna@example.ch");
    verify(ctx, ben.id, "ben@example.ch");
    verify(ctx, cleo.id, "cleo@example.ch", "unverified");
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts, "Trauung") });
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2999-05-01" });

    expect((await get<RsvpOverview>(root, "/api/admin/rsvp")).body.reminderCount).toBe(1);
    const sent = await call<{ sent: number }>(root, "POST", "/api/admin/rsvp/remind");
    expect(sent.body).toEqual({ sent: 1 });
    expect(ctx.mailer.sent.map((m) => m.to)).toEqual(["ben@example.ch"]);
    expect(ctx.mailer.sent[0]?.text).toContain("ben");
    expect(ctx.mailer.sent[0]?.text).toContain("http://localhost:5173/rsvp");
    expect(ctx.mailer.sent[0]?.text).toContain("2999-05-01");
  });

  it("[RSVP-07] a failing mail does not stop the others, and the admin cannot send reminders in a loop", async () => {
    const { ctx, call, guest, root } = await setup();
    for (const name of ["anna", "ben"]) verify(ctx, (await guest(name)).id, `${name}@example.ch`);
    ctx.mailer.failWith = new Error("smtp down");
    expect((await call<{ sent: number }>(root, "POST", "/api/admin/rsvp/remind")).body).toEqual({
      sent: 0,
    });
    ctx.mailer.failWith = undefined;
    for (let i = 0; i < 4; i += 1) await call(root, "POST", "/api/admin/rsvp/remind");
    expect((await call(root, "POST", "/api/admin/rsvp/remind")).status).toBe(429);
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
    const { ctx, root, call, parts, guest } = await setup();
    const anna = await guest("anna");
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2027-05-01" });
    await call(anna, "PUT", "/api/rsvp", { attendance: yes(parts, "Trauung") });
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
    expect(actions.every((a) => !a.startsWith("user.") && !a.startsWith("session."))).toBe(true);
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
