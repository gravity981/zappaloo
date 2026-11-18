// Person types: adult and child (RSVP-13, RSVP-14, RSVP-15; sw-architecture.md 7.4.2).
import { afterEach, describe, expect, it } from "vitest";
import type {
  IssuedInvitation,
  MenuOption,
  ProgramItem,
  Role,
  RsvpConfig,
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

const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

async function makeUser(ctx: TestContext, username: string, roles: Role[]): Promise<SignedIn> {
  const user = ctx.auth.accounts.createUser({ username, roles }, "cli");
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

async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  const root = await makeUser(ctx, "root", ["admin"]);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  const call = async <T>(
    who: SignedIn,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
  ) => {
    const response = await ctx.app.inject({
      method,
      url,
      headers: as(who),
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      status: response.statusCode,
      body: (response.body && response.headers["content-type"]?.toString().includes("json")
        ? response.json()
        : undefined) as T,
      text: response.body,
    };
  };
  await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: true });
  await call(root, "PUT", "/api/admin/rsvp/companion-approval", { enabled: false });
  const items: ProgramItem[] = [];
  for (const [name, hour, hasMeal] of [
    ["Trauung", 14, false],
    ["Dinner", 18, true],
  ] as const) {
    items.push(
      (
        await call<ProgramItem>(root, "POST", "/api/admin/rsvp/program-items", {
          name,
          activities: [{ name, startsAt: `2027-06-12T${String(hour)}:00:00.000Z` }],
          hasMeal,
        })
      ).body,
    );
  }
  const menus: MenuOption[] = [];
  for (const name of ["Fleisch", "Kindermenü"]) {
    const forChildren = name === "Kindermenü";
    menus.push(
      (await call<MenuOption>(root, "POST", "/api/admin/rsvp/menus", { name, forChildren })).body,
    );
  }
  const guest = async (username: string) => {
    const who = await makeUser(ctx, username, ["vip"]);
    await call(root, "PUT", `/api/admin/users/${String(who.id)}/program-items`, {
      programItemIds: items.map((i) => i.id),
    });
    return who;
  };
  const all = (...yes: string[]) =>
    items.map((i) => ({ programItemId: i.id, attending: yes.includes(i.name) }));
  return { ctx, root, call, items, menus, guest, all };
}

/** The value, which a test of a created thing expects to exist. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

const code = (body: unknown) => (body as { error: { code: string } }).error.code;

describe("person types of guests (RSVP-13)", () => {
  it("[RSVP-13] an invitation batch sets the type, adult by default, and the admin changes it in the account panel only", async () => {
    const { ctx, root, call } = await setup();
    const make = async (payload: object) =>
      (
        await call<{ invitations: IssuedInvitation[] }>(
          root,
          "POST",
          "/api/admin/invitations",
          payload,
        )
      ).body.invitations;
    const [adult] = await make({ guests: [{ name: "Erwachsen" }] });
    const [child] = await make({ guests: [{ name: "Kind" }], personType: "child" });
    expect(adult?.personType).toBe("adult");
    expect(child?.personType).toBe("child");
    const typeOf = (id: number) =>
      ctx.auth.accounts.listUsers().find((u) => u.id === id)?.personType;
    expect(typeOf(child?.userId ?? 0)).toBe("child");
    // The invitation list shows the type, but it cannot be changed there.
    expect(
      (
        await call<{ invitations: IssuedInvitation[] }>(root, "GET", "/api/admin/invitations")
      ).body.invitations.map((i) => i.personType),
    ).toEqual(["child", "adult"]);
    expect(
      (
        await call(root, "PUT", `/api/admin/invitations/${String(adult?.id)}/person-type`, {
          personType: "child",
        })
      ).status,
    ).toBe(404);

    // In the account panel.
    expect(
      (
        await call(root, "PUT", `/api/admin/users/${String(child?.userId)}/person-type`, {
          personType: "adult",
        })
      ).status,
    ).toBe(204);
    expect(typeOf(child?.userId ?? 0)).toBe("adult");
    expect(ctx.event.auditEntries().find((e) => e.action === "user.person_type")?.details).toEqual({
      userId: child?.userId,
      personType: "adult",
    });
    // There is no baby, other types and accounts are refused, and only admins decide.
    for (const personType of ["baby", "dog"]) {
      expect(
        (
          await call(root, "PUT", `/api/admin/users/${String(child?.userId)}/person-type`, {
            personType,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (await call(root, "PUT", "/api/admin/users/999/person-type", { personType: "adult" })).status,
    ).toBe(404);
    const guest = await makeUser(ctx, "anna", ["vip"]);
    expect(
      (
        await call(guest, "PUT", `/api/admin/users/${String(guest.id)}/person-type`, {
          personType: "child",
        })
      ).status,
    ).toBe(403);
  });

  it("[RSVP-13] the guest must choose the type of an accompanying person, and only the admin changes it afterwards", async () => {
    const { root, call, guest, all } = await setup();
    const erika = await guest("erika");
    const post = (body: object) => call<RsvpState>(erika, "POST", "/api/rsvp/companions", body);
    // There is no default, and there is no baby.
    expect((await post({ name: "Mia", attendance: all() })).status).toBe(400);
    expect((await post({ name: "Mia", personType: "baby", attendance: all() })).status).toBe(400);
    const made = await post({ name: "Mia", personType: "child", attendance: all() });
    expect(made.status).toBe(201);
    const mia = made.body.companions[0];
    expect(mia?.personType).toBe("child");
    // The admin changes name and type like the name (RSVP-09 rule).
    const patched = await call(root, "PATCH", `/api/admin/rsvp/companions/${String(mia?.id)}`, {
      personType: "adult",
    });
    expect(patched.status).toBe(204);
    expect((await call<RsvpState>(erika, "GET", "/api/rsvp")).body.companions[0]?.personType).toBe(
      "adult",
    );
    expect(
      (await call(root, "PATCH", `/api/admin/rsvp/companions/${String(mia?.id)}`, {})).status,
    ).toBe(400);
    expect(
      (
        await call(erika, "PATCH", `/api/admin/rsvp/companions/${String(mia?.id)}`, {
          personType: "child",
        })
      ).status,
    ).toBe(403);
  });
});

describe("the menus of adults and children (RSVP-14, RSVP-19)", () => {
  it("[RSVP-14][RSVP-19] everyone must choose from the list of their type", async () => {
    const { root, call, guest, all, menus } = await setup();
    const [adultMenu, childMenu] = [must(menus[0]), must(menus[1])];
    const erika = await guest("erika");
    const needed = await call(erika, "PUT", "/api/rsvp", { attendance: all("Trauung", "Dinner") });
    expect(code(needed.body)).toBe("menu_required");
    // An adult cannot take a menu of the children's list.
    const wrong = await call(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      menuId: childMenu.id,
    });
    expect(code(wrong.body)).toBe("invalid_menu");
    const chosen = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      menuId: adultMenu.id,
    });
    expect(chosen.body.answer?.menuId).toBe(adultMenu.id);

    await call(root, "PUT", `/api/admin/users/${String(erika.id)}/person-type`, {
      personType: "child",
    });
    const state = (await call<RsvpState>(erika, "GET", "/api/rsvp")).body;
    expect(state.personType).toBe("child");
    expect(state.menus.map((m) => [m.name, m.forChildren])).toEqual([
      ["Fleisch", false],
      ["Kindermenü", true],
    ]);
    // A child must choose too, from the children's list only.
    const none = await call(erika, "PUT", "/api/rsvp", { attendance: all("Dinner") });
    expect(code(none.body)).toBe("menu_required");
    const kid = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      menuId: childMenu.id,
    });
    expect(kid.body.answer?.menuId).toBe(childMenu.id);
    // The adults' menu was chosen before: it is not accepted again once the child has another one.
    const back = await call(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      menuId: adultMenu.id,
    });
    expect(code(back.body)).toBe("invalid_menu");

    // The same for accompanying persons.
    const mia = await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "child",
      attendance: all("Dinner"),
    });
    expect(code(mia.body)).toBe("menu_required");
    const miaKid = await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "child",
      attendance: all("Dinner"),
      menuId: childMenu.id,
    });
    expect(miaKid.status).toBe(201);
    const miaAdult = await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "child",
      attendance: all("Dinner"),
      menuId: adultMenu.id,
    });
    expect(code(miaAdult.body)).toBe("invalid_menu");
  });

  it("[RSVP-19] without children's menus a child is not asked", async () => {
    const { root, call, guest, all } = await setup();
    const erika = await guest("erika");
    await call(root, "PUT", `/api/admin/users/${String(erika.id)}/person-type`, {
      personType: "child",
    });
    const config = (await call<RsvpConfig>(root, "GET", "/api/admin/rsvp/config")).body;
    for (const menu of config.menus.filter((m) => m.forChildren)) {
      await call(root, "DELETE", `/api/admin/rsvp/menus/${String(menu.id)}`);
    }
    const answered = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      allergies: "Nüsse",
    });
    expect(answered.status).toBe(200);
    expect(answered.body.answer).toMatchObject({ menuId: null, allergies: "Nüsse" });
  });

  it("[RSVP-19] a child keeps an adults' menu until it is chosen again; the totals count it apart", async () => {
    const { root, call, guest, all, menus } = await setup();
    const [adultMenu, childMenu] = [must(menus[0]), must(menus[1])];
    const erika = await guest("erika");
    await call(erika, "PUT", "/api/rsvp", { attendance: all("Dinner"), menuId: adultMenu.id });
    // The admin changes the type: the choice stays, it is now an adults' menu of a child.
    await call(root, "PUT", `/api/admin/users/${String(erika.id)}/person-type`, {
      personType: "child",
    });
    const kept = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      menuId: adultMenu.id,
    });
    expect(kept.body.answer?.menuId).toBe(adultMenu.id);
    const before = (await call<RsvpOverview>(root, "GET", "/api/admin/rsvp")).body;
    expect(before.menuTotals).toEqual([{ menuId: adultMenu.id, count: 1, childCount: 1 }]);

    await call(erika, "PUT", "/api/rsvp", { attendance: all("Dinner"), menuId: childMenu.id });
    const after = (await call<RsvpOverview>(root, "GET", "/api/admin/rsvp")).body;
    expect(after.menuTotals).toEqual([{ menuId: childMenu.id, count: 1, childCount: 1 }]);
  });
});

describe("totals and the guest table by type (RSVP-15)", () => {
  it("[RSVP-15] the totals per person count everyone once, also guests who are invited to different program items", async () => {
    const { root, call, guest, all, menus, items } = await setup();
    const erika = await guest("erika");
    const ben = await guest("ben");
    const carl = await guest("carl");
    const dora = await guest("dora");
    await guest("emil");
    await call(root, "PUT", `/api/admin/users/${String(ben.id)}/person-type`, {
      personType: "child",
    });
    // Dora is invited to the dinner only.
    const dinnerId = items[1]?.id ?? 0;
    await call(root, "PUT", `/api/admin/users/${String(dora.id)}/program-items`, {
      programItemIds: [dinnerId],
    });
    await call(erika, "PUT", "/api/rsvp", { attendance: all("Trauung") });
    await call(ben, "PUT", "/api/rsvp", { attendance: all("Trauung") });
    await call(carl, "PUT", "/api/rsvp", { attendance: all() });
    await call(dora, "PUT", "/api/rsvp", {
      attendance: [{ programItemId: dinnerId, attending: true }],
      menuId: menus[0]?.id,
    });
    await call(carl, "POST", "/api/rsvp/companions", {
      name: "Cleo",
      personType: "child",
      attendance: all(),
    });
    const overview = (await call<RsvpOverview>(root, "GET", "/api/admin/rsvp")).body;
    // Yes: erika, ben and dora, who attends a program item the others do not. No: carl and Cleo,
    // who declined everything. Emil has not answered and counts in neither.
    expect(overview.personTotals).toEqual({ yes: 3, no: 2, yesByType: { adult: 2, child: 1 } });
    // No single program item has these numbers.
    expect(overview.totals.map((t) => t.yes)).not.toContain(3);
  });

  it("[RSVP-15] totals per program item split by type, a column Typ in the guest table and in the CSV", async () => {
    const { root, call, guest, all, menus, items } = await setup();
    const erika = await guest("erika");
    const ben = await guest("ben");
    await call(root, "PUT", `/api/admin/users/${String(ben.id)}/person-type`, {
      personType: "child",
    });
    await call(erika, "PUT", "/api/rsvp", {
      attendance: all("Trauung", "Dinner"),
      menuId: menus[0]?.id,
    });
    await call(ben, "PUT", "/api/rsvp", { attendance: all("Trauung") });
    await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "child",
      attendance: all("Trauung"),
    });
    const overview = (await call<RsvpOverview>(root, "GET", "/api/admin/rsvp")).body;
    const trauung = overview.totals.find((t) => t.programItemId === items[0]?.id);
    // erika (adult), ben (child), Mia (child).
    expect(trauung).toMatchObject({ yes: 3, yesByType: { adult: 1, child: 2 } });
    const dinner = overview.totals.find((t) => t.programItemId === items[1]?.id);
    expect(dinner).toMatchObject({ yes: 1, yesByType: { adult: 1, child: 0 } });
    expect(overview.guests.map((g) => [g.name, g.personType]).sort()).toEqual([
      ["ben", "child"],
      ["erika", "adult"],
    ]);

    const csv = (await call(root, "GET", "/api/admin/rsvp/export")).text.split("\r\n");
    expect(csv[0]?.startsWith("Name;Typ;Status;")).toBe(true);
    expect(csv.find((line) => line.startsWith("erika;"))).toMatch(/^erika;Erwachsen;zugesagt;/);
    expect(csv.find((line) => line.startsWith("ben;"))).toMatch(/^ben;Kind;zugesagt;/);
    expect(csv.find((line) => line.startsWith("↳ Mia;"))).toMatch(/^↳ Mia;Kind;bestätigt;/);
  });
});
