// Person types: adult, child, baby (RSVP-13, RSVP-14, RSVP-15; sw-architecture.md 7.4.2).
import { afterEach, describe, expect, it } from "vitest";
import type {
  IssuedInvitation,
  MenuOption,
  ProgramItem,
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
          startsAt: `2027-06-12T${String(hour)}:00:00.000Z`,
          hasMeal,
        })
      ).body,
    );
  }
  const menus: MenuOption[] = [];
  for (const name of ["Fleisch", "Kindermenü"]) {
    menus.push((await call<MenuOption>(root, "POST", "/api/admin/rsvp/menus", { name })).body);
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

describe("the menu of a child is optional (RSVP-14)", () => {
  it("[RSVP-14] an adult must choose the menu, a child may leave it open or choose one", async () => {
    const { root, call, guest, all, menus } = await setup();
    const erika = await guest("erika");
    const needed = await call(erika, "PUT", "/api/rsvp", { attendance: all("Trauung", "Dinner") });
    expect(needed.status).toBe(400);
    expect(code(needed.body)).toBe("menu_required");

    await call(root, "PUT", `/api/admin/users/${String(erika.id)}/person-type`, {
      personType: "child",
    });
    expect((await call<RsvpState>(erika, "GET", "/api/rsvp")).body.personType).toBe("child");
    // Without a menu: allowed, allergies are kept.
    const open = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: all("Trauung", "Dinner"),
      allergies: "Nüsse",
    });
    expect(open.status).toBe(200);
    expect(open.body.answer).toMatchObject({ menuId: null, allergies: "Nüsse" });
    // With a menu: stored, and an unknown one is refused.
    const chosen = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: all("Trauung", "Dinner"),
      menuId: menus[1]?.id,
    });
    expect(chosen.body.answer?.menuId).toBe(menus[1]?.id);
    const unknown = await call(erika, "PUT", "/api/rsvp", {
      attendance: all("Dinner"),
      menuId: 9999,
    });
    expect(code(unknown.body)).toBe("invalid_menu");

    // The same for an accompanying child, while an accompanying adult must choose.
    const mia = await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "child",
      attendance: all("Dinner"),
    });
    expect(mia.status).toBe(201);
    expect(mia.body.companions[0]).toMatchObject({ menuId: null });
    const adultGuest = await call(erika, "POST", "/api/rsvp/companions", {
      name: "Ben",
      personType: "adult",
      attendance: all("Dinner"),
    });
    expect(code(adultGuest.body)).toBe("menu_required");
  });

  it("[RSVP-14] a child without a menu choice is not counted in the menus", async () => {
    const { root, call, guest, all, menus } = await setup();
    const erika = await guest("erika");
    await call(erika, "PUT", "/api/rsvp", { attendance: all("Dinner"), menuId: menus[0]?.id });
    await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Noah",
      personType: "child",
      attendance: all("Dinner"),
    });
    await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      personType: "child",
      attendance: all("Dinner"),
      menuId: menus[1]?.id,
    });
    const overview = (await call<RsvpOverview>(root, "GET", "/api/admin/rsvp")).body;
    // Erika and Mia chose, Noah left it open. All three attend the meal.
    expect(overview.menuTotals.map((t) => [t.menuId, t.count]).sort()).toEqual(
      [
        [menus[0]?.id, 1],
        [menus[1]?.id, 1],
      ].sort(),
    );
    const dinner = overview.totals.find((t) => t.yes === 3);
    expect(dinner?.yesByType).toEqual({ adult: 1, child: 2 });
  });
});

describe("totals and the guest table by type (RSVP-15)", () => {
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
