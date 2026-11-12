import { afterEach, describe, expect, it } from "vitest";
import type {
  ActivityEntry,
  ProgramItem,
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
const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

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

/** An event with the program items Trauung, Apéro, Dinner (meal), Party, two menus, an admin. */
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
        ? response.json<T>()
        : undefined) as T,
      text: response.body,
    };
  };
  const programItems: ProgramItem[] = [];
  for (const [name, hour, hasMeal] of [
    ["Trauung", 14, false],
    ["Apéro", 15, false],
    ["Dinner", 18, true],
    ["Party", 22, false],
  ] as const) {
    const made = await call<ProgramItem>(root, "POST", "/api/admin/rsvp/program-items", {
      name,
      startsAt: `2027-06-12T${String(hour)}:00:00.000Z`,
      hasMeal,
    });
    programItems.push(must(made.body));
  }
  // The tests of this file answer per program item and approve companions (the settings of
  // 7.4.1); the defaults of 7.4.2 are tested on their own.
  await call(root, "PUT", "/api/admin/rsvp/per-item", { enabled: true });
  await call(root, "PUT", "/api/admin/rsvp/companion-approval", { enabled: true });
  const menus: MenuOption[] = [];
  for (const name of ["Fleisch", "Kindermenü"]) {
    menus.push(
      must((await call<MenuOption>(root, "POST", "/api/admin/rsvp/menus", { name })).body),
    );
  }
  const guest = async (username: string, programItemIds = programItems.map((p) => p.id)) => {
    const who = await makeUser(ctx, username, ["vip"]);
    await call(root, "PUT", `/api/admin/users/${String(who.id)}/program-items`, { programItemIds });
    return who;
  };
  return { ctx, root, call, get, programItems, menus, guest };
}

const attend = (programItems: ProgramItem[], ...names: string[]) =>
  programItems.map((p) => ({ programItemId: p.id, attending: names.includes(p.name) }));
const id = (programItems: ProgramItem[], name: string) =>
  must(programItems.find((p) => p.name === name)).id;

describe("requesting an accompanying person", () => {
  it("[RSVP-08] a guest requests a person with name, attendance, menu and allergies; it is pending and has no account", async () => {
    const { ctx, call, get, programItems, menus, guest } = await setup();
    const erika = await guest("erika");
    const before = ctx.database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get() as {
      n: number;
    };
    const made = await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia Huber",
      note: "Meine Tochter, 6 Jahre",
      attendance: attend(programItems, "Trauung", "Dinner"),
      menuId: menus[1]?.id,
      allergies: "Nüsse",
    });
    expect(made.status).toBe(201);
    expect(made.body?.companions).toEqual([
      {
        id: expect.any(Number) as number,
        name: "Mia Huber",
        note: "Meine Tochter, 6 Jahre",
        status: "pending",
        attendingItemIds: [id(programItems, "Trauung"), id(programItems, "Dinner")],
        declinedItemIds: programItems
          .map((programItem) => programItem.id)
          .filter(
            (programItemId) =>
              programItemId !== id(programItems, "Trauung") &&
              programItemId !== id(programItems, "Dinner"),
          ),
        menuId: menus[1]?.id,
        allergies: "Nüsse",
      },
    ]);
    // The state of the guest lists it too, and no account was created.
    expect((await get<RsvpState>(erika, "/api/rsvp")).body.companions).toHaveLength(1);
    expect(ctx.database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual(before);
  });

  it("[RSVP-08] the person's RSVP follows the same rules: invited program items only, a menu for the meal program item", async () => {
    const { call, programItems, guest } = await setup();
    const erika = await guest("erika", [id(programItems, "Apéro"), id(programItems, "Dinner")]);
    const post = (body: object) => call(erika, "POST", "/api/rsvp/companions", body);
    // Attendance must cover exactly the guest's invited program items.
    expect((await post({ name: "Mia", attendance: attend(programItems, "Trauung") })).status).toBe(
      400,
    );
    const own = programItems.filter((p) => ["Apéro", "Dinner"].includes(p.name));
    // Dinner is the meal program item: a menu is required.
    const noMenu = await post({ name: "Mia", attendance: attend(own, "Dinner") });
    expect(noMenu.status).toBe(400);
    expect((noMenu.body as { error: { code: string } }).error.code).toBe("menu_required");
    expect((await post({ name: "Mia", attendance: attend(own, "Apéro") })).status).toBe(201);
    expect((await post({ name: " ", attendance: attend(own) })).status).toBe(400);
  });

  it("[RSVP-08] only guests request, and only while the RSVP feature is on", async () => {
    const { ctx, call, programItems, guest, root } = await setup();
    const erika = await guest("erika");
    const body = { name: "Mia", attendance: attend(programItems) };
    expect((await call(root, "POST", "/api/rsvp/companions", body)).status).toBe(403);
    expect(
      (await ctx.app.inject({ method: "POST", url: "/api/rsvp/companions", payload: body }))
        .statusCode,
    ).toBe(401);
    ctx.event.setFeature("rsvp", false, "cli");
    expect((await call(erika, "POST", "/api/rsvp/companions", body)).status).toBe(404);
  });

  it("[RSVP-08] at most ten pending and approved persons per guest; rejected ones do not count", async () => {
    const { call, programItems, guest, root } = await setup();
    const erika = await guest("erika");
    const body = (name: string) => ({ name, attendance: attend(programItems) });
    for (let i = 0; i < 10; i += 1) {
      expect(
        (await call(erika, "POST", "/api/rsvp/companions", body(`P${String(i)}`))).status,
      ).toBe(201);
    }
    const full = await call(erika, "POST", "/api/rsvp/companions", body("zu viel"));
    expect(full.status).toBe(409);
    expect((full.body as { error: { code: string } }).error.code).toBe("companion_limit");
    // A rejected request frees a place.
    const first = must(
      (await call<RsvpState>(erika, "PUT", "/api/rsvp", { attendance: attend(programItems) })).body,
    ).companions[0];
    await call(root, "POST", `/api/admin/rsvp/companions/${String(must(first).id)}/reject`);
    expect((await call(erika, "POST", "/api/rsvp/companions", body("jetzt ja"))).status).toBe(201);
  });
});

describe("changing and withdrawing", () => {
  async function pending() {
    const s = await setup();
    const erika = await s.guest("erika");
    const made = await s.call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia Huber",
      attendance: attend(s.programItems, "Trauung"),
    });
    return { ...s, erika, companion: must(made.body?.companions[0]) };
  }

  it("[RSVP-10] while pending the guest edits name, note and answer, or withdraws the request", async () => {
    const { call, erika, companion, programItems } = await pending();
    const edited = await call<RsvpState>(
      erika,
      "PUT",
      `/api/rsvp/companions/${String(companion.id)}`,
      {
        name: "Mia Maria Huber",
        note: "Tochter, 6",
        attendance: attend(programItems, "Apéro"),
      },
    );
    expect(edited.status).toBe(200);
    expect(edited.body?.companions[0]).toMatchObject({
      name: "Mia Maria Huber",
      note: "Tochter, 6",
      status: "pending",
      attendingItemIds: [id(programItems, "Apéro")],
    });
    const withdrawn = await call<RsvpState>(
      erika,
      "DELETE",
      `/api/rsvp/companions/${String(companion.id)}`,
    );
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body?.companions).toEqual([]);
  });

  it("[RSVP-10] an approved person cannot be withdrawn or edited as a request; a rejected one is removed by the guest", async () => {
    const { call, erika, root, companion, programItems } = await pending();
    const other = must(
      (
        await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
          name: "Noah",
          attendance: attend(programItems),
        })
      ).body?.companions[1],
    );
    await call(root, "POST", `/api/admin/rsvp/companions/${String(companion.id)}/approve`);
    await call(root, "POST", `/api/admin/rsvp/companions/${String(other.id)}/reject`);

    const code = (r: { body: unknown }) => (r.body as { error: { code: string } }).error.code;
    const edit = await call(erika, "PUT", `/api/rsvp/companions/${String(companion.id)}`, {
      name: "Neu",
      attendance: attend(programItems),
    });
    expect([edit.status, code(edit)]).toEqual([409, "companion_not_editable"]);
    const withdraw = await call(erika, "DELETE", `/api/rsvp/companions/${String(companion.id)}`);
    expect([withdraw.status, code(withdraw)]).toEqual([409, "companion_not_editable"]);
    // A rejected request stays visible and the guest can remove it.
    const state = (
      await call<RsvpState>(erika, "PUT", "/api/rsvp", { attendance: attend(programItems) })
    ).body;
    expect(state?.companions.map((c) => c.status)).toEqual(["approved", "rejected"]);
    expect((await call(erika, "DELETE", `/api/rsvp/companions/${String(other.id)}`)).status).toBe(
      200,
    );
  });

  it("[RSVP-10] nobody touches the companions of another guest", async () => {
    const { call, guest, companion, programItems } = await pending();
    const ben = await guest("ben");
    for (const [method, payload] of [
      ["PUT", { name: "X", attendance: attend(programItems) }],
      ["DELETE", undefined],
    ] as const) {
      const res = await call(ben, method, `/api/rsvp/companions/${String(companion.id)}`, payload);
      expect(res.status, method).toBe(404);
    }
    const sneaky = await call(ben, "PUT", "/api/rsvp", {
      attendance: attend(programItems),
      companions: [{ companionId: companion.id, attendance: attend(programItems) }],
    });
    expect(sneaky.status).toBe(404);
  });

  it("[RSVP-04] after the deadline guests cannot request, edit or withdraw; the admin still decides", async () => {
    const { call, erika, root, companion, programItems } = await pending();
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2020-01-01" });
    const closed = (r: { status: number; body: unknown }) => [
      r.status,
      (r.body as { error: { code: string } }).error.code,
    ];
    expect(
      closed(
        await call(erika, "POST", "/api/rsvp/companions", {
          name: "X",
          attendance: attend(programItems),
        }),
      ),
    ).toEqual([403, "rsvp_closed"]);
    expect(
      closed(
        await call(erika, "PUT", `/api/rsvp/companions/${String(companion.id)}`, {
          name: "X",
          attendance: attend(programItems),
        }),
      ),
    ).toEqual([403, "rsvp_closed"]);
    expect(
      closed(await call(erika, "DELETE", `/api/rsvp/companions/${String(companion.id)}`)),
    ).toEqual([403, "rsvp_closed"]);
    expect(
      (await call(root, "POST", `/api/admin/rsvp/companions/${String(companion.id)}/approve`))
        .status,
    ).toBe(204);
  });
});

describe("approval", () => {
  it("[RSVP-09] the admin approves or rejects once; only admins decide", async () => {
    const { call, root, guest, programItems } = await setup();
    const erika = await guest("erika");
    const made = await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      attendance: attend(programItems),
    });
    const mia = must(made.body?.companions[0]);
    expect(
      (await call(erika, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`)).status,
    ).toBe(403);
    expect((await call(root, "POST", "/api/admin/rsvp/companions/999/approve")).status).toBe(404);
    expect(
      (await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`)).status,
    ).toBe(204);
    const again = await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/reject`);
    expect(again.status).toBe(409);
    expect((again.body as { error: { code: string } }).error.code).toBe("companion_decided");
  });

  it("[RSVP-09] an approved person counts in totals, menus, the guest table and the CSV; a pending or rejected one does not", async () => {
    const { call, get, root, guest, programItems, menus } = await setup();
    const erika = await guest("erika");
    await call(erika, "PUT", "/api/rsvp", {
      attendance: attend(programItems, "Trauung", "Dinner"),
      menuId: menus[0]?.id,
    });
    const request = async (name: string, ...names: string[]) =>
      must(
        (
          await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
            name,
            attendance: attend(programItems, ...names),
            ...(names.includes("Dinner") ? { menuId: menus[1]?.id, allergies: "Laktose" } : {}),
          })
        ).body?.companions.find((c) => c.name === name),
      );
    const mia = await request("Mia", "Trauung", "Dinner");
    const noah = await request("Noah", "Trauung");
    await request("Pia", "Trauung", "Dinner");
    await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`);
    await call(root, "POST", `/api/admin/rsvp/companions/${String(noah.id)}/reject`);

    const overview = (await get<RsvpOverview>(root, "/api/admin/rsvp")).body;
    const total = (name: string) =>
      overview.totals.find((t) => t.programItemId === id(programItems, name));
    // Erika and Mia attend the Trauung; Pia (pending) and Noah (rejected) do not count.
    expect(total("Trauung")).toMatchObject({ yes: 2, no: 0 });
    expect(total("Dinner")).toMatchObject({ yes: 2, no: 0 });
    expect(total("Apéro")).toMatchObject({ yes: 0, no: 2 });
    expect(overview.menuTotals).toEqual(
      expect.arrayContaining([
        { menuId: menus[0]?.id, count: 1 },
        { menuId: menus[1]?.id, count: 1 },
      ]),
    );
    expect(overview.pendingCount).toBe(1);
    expect(overview.companions.map((c) => [c.name, c.status, c.hostName])).toEqual([
      ["Mia", "approved", "erika"],
      ["Noah", "rejected", "erika"],
      ["Pia", "pending", "erika"],
    ]);
    // The guest counts once in "answered / total", companions have no answer of their own.
    expect(overview.total).toBe(1);

    const lines = (await get(root, "/api/admin/rsvp/export")).text.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("↳ Mia;bestätigt;ja;nein;ja;nein;Kindermenü;;Laktose");
  });

  it("[RSVP-09] the guest changes an approved person's attendance, menu and allergies in the RSVP, without a new approval", async () => {
    const { call, root, guest, programItems, menus } = await setup();
    const erika = await guest("erika");
    const mia = must(
      (
        await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
          name: "Mia",
          attendance: attend(programItems, "Trauung"),
        })
      ).body?.companions[0],
    );
    await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`);
    const saved = await call<RsvpState>(erika, "PUT", "/api/rsvp", {
      attendance: attend(programItems, "Dinner"),
      menuId: menus[0]?.id,
      companions: [
        {
          companionId: mia.id,
          attendance: attend(programItems, "Apéro", "Dinner"),
          menuId: menus[1]?.id,
          allergies: "Erdnüsse",
        },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body?.companions[0]).toMatchObject({
      status: "approved",
      attendingItemIds: [id(programItems, "Apéro"), id(programItems, "Dinner")],
      menuId: menus[1]?.id,
      allergies: "Erdnüsse",
    });
    // The companion's answer is checked like the guest's: Dinner needs a menu.
    const bad = await call(erika, "PUT", "/api/rsvp", {
      attendance: attend(programItems, "Dinner"),
      menuId: menus[0]?.id,
      companions: [{ companionId: mia.id, attendance: attend(programItems, "Dinner") }],
    });
    expect(bad.status).toBe(400);
  });

  it("[RSVP-09] the name of an approved person is changed by the admin only", async () => {
    const { call, get, root, guest, programItems } = await setup();
    const erika = await guest("erika");
    const mia = must(
      (
        await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
          name: "Mia",
          attendance: attend(programItems),
        })
      ).body?.companions[0],
    );
    await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`);
    expect(
      (await call(erika, "PATCH", `/api/admin/rsvp/companions/${String(mia.id)}`, { name: "X" }))
        .status,
    ).toBe(403);
    expect(
      (await call(root, "PATCH", `/api/admin/rsvp/companions/${String(mia.id)}`, { name: "Maria" }))
        .status,
    ).toBe(204);
    expect((await get<RsvpState>(erika, "/api/rsvp")).body.companions[0]?.name).toBe("Maria");
    expect(
      (await call(root, "PATCH", "/api/admin/rsvp/companions/999", { name: "X" })).status,
    ).toBe(404);
  });

  it("[RSVP-04] the admin changes a guest's companions in admin mode after the deadline", async () => {
    const { call, root, guest, programItems } = await setup();
    const erika = await guest("erika");
    const mia = must(
      (
        await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
          name: "Mia",
          attendance: attend(programItems, "Trauung"),
        })
      ).body?.companions[0],
    );
    await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`);
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2020-01-01" });
    const done = await call<RsvpState>(root, "PUT", `/api/admin/rsvp/guests/${String(erika.id)}`, {
      attendance: attend(programItems),
      companions: [{ companionId: mia.id, attendance: attend(programItems, "Party") }],
    });
    expect(done.status).toBe(200);
    expect(done.body?.companions[0]?.attendingItemIds).toEqual([id(programItems, "Party")]);
  });
});

describe("deleting and privacy", () => {
  it("[RSVP-09] deleting the guest's account deletes their accompanying persons", async () => {
    const { ctx, call, guest, programItems } = await setup();
    const erika = await guest("erika");
    await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      attendance: attend(programItems, "Trauung"),
    });
    const count = (table: string) =>
      (ctx.database.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect([count("companions"), count("companion_attendance")]).toEqual([1, 4]);
    const deleted = await call(erika, "DELETE", "/api/profile", { password: PASSWORD });
    expect(deleted.status).toBe(204);
    expect([count("companions"), count("companion_attendance")]).toEqual([0, 0]);
  });

  it("[RSVP-09] removing a program item from the guest's invitation removes their companions' answers for it", async () => {
    const { call, get, root, guest, programItems } = await setup();
    const erika = await guest("erika");
    await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      attendance: attend(programItems, "Trauung", "Party"),
    });
    await call(root, "PUT", `/api/admin/users/${String(erika.id)}/program-items`, {
      programItemIds: programItems.filter((p) => p.name !== "Party").map((p) => p.id),
    });
    const state = (await get<RsvpState>(erika, "/api/rsvp")).body;
    expect(state.companions[0]?.attendingItemIds).toEqual([id(programItems, "Trauung")]);
  });

  it("[SEC-11] companions' allergies reach only the guest and admins, never the log or the activity card", async () => {
    const { ctx, call, get, root, guest, programItems, menus } = await setup();
    const erika = await guest("erika");
    const ben = await guest("ben");
    await call(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      attendance: attend(programItems, "Dinner"),
      menuId: menus[1]?.id,
      allergies: "GEHEIM-KIND-ALLERGIE",
    });
    expect((await get(erika, "/api/rsvp")).text).toContain("GEHEIM-KIND-ALLERGIE");
    expect((await get(ben, "/api/rsvp")).text).not.toContain("GEHEIM-KIND-ALLERGIE");
    expect((await get(ben, "/api/admin/rsvp")).status).toBe(403);
    expect((await get(root, "/api/admin/rsvp")).text).toContain("GEHEIM-KIND-ALLERGIE");
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("GEHEIM-KIND-ALLERGIE");
    expect((await get(root, "/api/admin/activity")).text).not.toContain("GEHEIM-KIND-ALLERGIE");
  });

  it("[DATA-05] the card Zuletzt lists requests and decisions with the person's name", async () => {
    const { call, get, root, guest, programItems } = await setup();
    const erika = await guest("erika");
    const mia = must(
      (
        await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
          name: "Mia Huber",
          attendance: attend(programItems),
        })
      ).body?.companions[0],
    );
    await call(root, "POST", `/api/admin/rsvp/companions/${String(mia.id)}/approve`);
    const entries = (await get<{ entries: ActivityEntry[] }>(root, "/api/admin/activity")).body
      .entries;
    expect(entries.slice(0, 2).map((e) => [e.action, e.name])).toEqual([
      ["companion.approve", "Mia Huber"],
      ["companion.request", "Mia Huber"],
    ]);
  });
});

describe("companion approval as a setting (RSVP-12, 7.4.2)", () => {
  interface Config {
    companionApproval: boolean;
    pendingCount: number;
  }
  interface Overview {
    pendingCount: number;
    totals: { programItemId: number; yes: number }[];
    companions: { id: number; status: string }[];
  }

  it("[RSVP-12] approval is off by default: an added person is approved at once and counts right away", async () => {
    const ctx = await createTestApp();
    context = ctx;
    const root = await makeUser(ctx, "root", ["admin"]);
    const config = await ctx.app.inject({
      url: "/api/admin/rsvp/config",
      headers: { cookie: root.cookie },
    });
    expect(config.json<Config>().companionApproval).toBe(false);
    await ctx.close();
    context = undefined;

    const { call, get, programItems, guest, root: admin } = await setup();
    await call(admin, "PUT", "/api/admin/rsvp/companion-approval", { enabled: false });
    const erika = await guest("erika");
    const ok = await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia Huber",
      attendance: attend(programItems),
    });
    expect(ok.status).toBe(201);
    expect(ok.body?.companions[0]?.status).toBe("approved");
    expect(ok.body?.companionApproval).toBe(false);
    const overview = (await get<Overview>(admin, "/api/admin/rsvp")).body;
    expect(overview.pendingCount).toBe(0);
    expect(
      (
        await get<{ pendingCount: number; companionApproval: boolean }>(
          admin,
          "/api/admin/rsvp/pending",
        )
      ).body,
    ).toEqual({ pendingCount: 0, companionApproval: false });
  });

  it("[RSVP-12] with approval off the guest removes an added person until the deadline; with approval on only a pending one", async () => {
    const { call, programItems, guest, root } = await setup();
    const erika = await guest("erika");
    const body = { name: "Mia", attendance: attend(programItems) };
    // Approval on: an approved person cannot be removed by the guest (RSVP-10).
    const requested = must(
      (await call<RsvpState>(erika, "POST", "/api/rsvp/companions", body)).body,
    );
    const miaId = must(requested.companions[0]).id;
    await call(root, "POST", `/api/admin/rsvp/companions/${String(miaId)}/approve`);
    expect((await call(erika, "DELETE", `/api/rsvp/companions/${String(miaId)}`)).status).toBe(409);

    // Approval off: the same person can be removed.
    await call(root, "PUT", "/api/admin/rsvp/companion-approval", { enabled: false });
    const removed = await call<RsvpState>(erika, "DELETE", `/api/rsvp/companions/${String(miaId)}`);
    expect(removed.status).toBe(200);
    expect(removed.body?.companions).toEqual([]);

    // After the deadline the guest cannot remove, the admin still can.
    const again = must((await call<RsvpState>(erika, "POST", "/api/rsvp/companions", body)).body);
    const noahId = must(again.companions[0]).id;
    await call(root, "PUT", "/api/admin/rsvp/deadline", { deadline: "2020-01-01" });
    expect((await call(erika, "DELETE", `/api/rsvp/companions/${String(noahId)}`)).status).toBe(
      403,
    );
    expect(
      (await call(root, "DELETE", `/api/admin/rsvp/companions/${String(noahId)}`)).status,
    ).toBe(204);
  });

  it("[RSVP-12] the admin removes an accompanying person at any time; only admins, and it is audited", async () => {
    const { ctx, call, get, programItems, guest, root } = await setup();
    const erika = await guest("erika");
    const added = must(
      (
        await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
          name: "Mia",
          attendance: attend(programItems),
        })
      ).body,
    );
    const miaId = must(added.companions[0]).id;
    expect(
      (await call(erika, "DELETE", `/api/admin/rsvp/companions/${String(miaId)}`)).status,
    ).toBe(403);
    expect((await call(root, "DELETE", "/api/admin/rsvp/companions/9999")).status).toBe(404);
    expect((await call(root, "DELETE", `/api/admin/rsvp/companions/${String(miaId)}`)).status).toBe(
      204,
    );
    expect((await get<RsvpState>(erika, "/api/rsvp")).body.companions).toEqual([]);
    const entry = ctx.event.auditEntries().find((e) => e.action === "companion.remove");
    expect(entry?.details).toEqual({ companionId: miaId });
  });

  it("[RSVP-12] switching approval off approves every pending request; rejected ones stay rejected", async () => {
    const { ctx, call, get, programItems, guest, root } = await setup();
    const erika = await guest("erika");
    const add = async (name: string) =>
      must(
        (
          await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
            name,
            attendance: attend(programItems),
          })
        ).body,
      );
    await add("Eins");
    await add("Zwei");
    const state = await add("Drei");
    const [one, , three] = state.companions;
    await call(root, "POST", `/api/admin/rsvp/companions/${String(must(three).id)}/reject`);
    expect((await get<Config>(root, "/api/admin/rsvp/config")).body.pendingCount).toBe(2);
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/companion-approval", { enabled: "no" })).status,
    ).toBe(400);
    expect(
      (await call(erika, "PUT", "/api/admin/rsvp/companion-approval", { enabled: false })).status,
    ).toBe(403);
    const off = await call<{ approved: number }>(
      root,
      "PUT",
      "/api/admin/rsvp/companion-approval",
      {
        enabled: false,
      },
    );
    expect(off.body).toEqual({ approved: 2 });
    const overview = (await get<Overview>(root, "/api/admin/rsvp")).body;
    expect(overview.pendingCount).toBe(0);
    expect(overview.companions.map((c) => c.status).sort()).toEqual([
      "approved",
      "approved",
      "rejected",
    ]);
    expect(must(one).id).toBeGreaterThan(0);
    const entry = ctx.event.auditEntries().find((e) => e.action === "rsvp.companion_approval");
    expect(entry?.details).toEqual({ to: false, approved: 2 });
    // Switching it on again changes nothing for the approved ones; the next added person waits.
    expect(
      (await call(root, "PUT", "/api/admin/rsvp/companion-approval", { enabled: true })).status,
    ).toBe(200);
    expect((await add("Vier")).companions.at(-1)?.status).toBe("pending");
  });
});
