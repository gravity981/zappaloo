// The avatar editor's API (AVA-01, AVA-02; sw-architecture.md 7.3): which figures a person may choose by the tiers
// and the roles, the choice, the fallback, and the companions.
import { afterEach, describe, expect, it } from "vitest";
import type { AvatarResponse, Role } from "@zappaloo/shared";
import { companions } from "../database/schema.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { buildArchive } from "../packages/build.ts";
import { buildTestWorld, testWorldFiles } from "../world/build.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;

/** An app with the test world, whose figures are tier1: wedding-guest, male-guest, kid; tier2: crew; tier3: pastor. */
async function setup(): Promise<{ ctx: TestContext; admin: Headers }> {
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

const get = async (ctx: TestContext, headers: Headers) =>
  (await ctx.app.inject({ url: "/api/avatar", headers })).json<AvatarResponse>();
const put = (ctx: TestContext, headers: Headers, person: string, figure: string) =>
  ctx.app.inject({ method: "PUT", url: `/api/avatar/${person}`, headers, payload: { figure } });
const idsOf = (response: AvatarResponse, person = "me") =>
  response.persons.find((item) => item.id === person)?.figures.map((figure) => figure.id);

/** The id of the signed-in user. */
async function idOf(ctx: TestContext, headers: Headers): Promise<number> {
  const session = await ctx.app.inject({ url: "/api/session", headers });
  return session.json<{ user: { id: number } }>().user.id;
}

async function userWith(ctx: TestContext, name: string, roles: Role[]) {
  return signIn(ctx, name, roles);
}

describe("the avatar editor's figures (AVA-01, AVA-02)", () => {
  it("[AVA-01] a vip may choose the tier1 figures with their kinds; the tier stays on the server", async () => {
    const { ctx } = await setup();
    const vip = await userWith(ctx, "gast", ["vip"]);
    const response = await get(ctx, vip);
    expect(idsOf(response)).toEqual(["wedding-guest", "male-guest", "kid"]);
    const [me] = response.persons;
    expect(me?.figures.map((figure) => figure.type)).toEqual(["female", "male", "child"]);
    expect(JSON.stringify(response)).not.toContain("tier");
  });

  it("[AVA-01] the tiers are exact: staff chooses tier2, an admin tier3, and a user with several roles the union", async () => {
    const { ctx } = await setup();
    expect(idsOf(await get(ctx, await userWith(ctx, "crew", ["staff"])))).toEqual(["crew"]);
    expect(idsOf(await get(ctx, await userWith(ctx, "chef", ["admin"])))).toEqual(["pastor"]);
    const both = await userWith(ctx, "beides", ["vip", "staff"]);
    expect(idsOf(await get(ctx, both))).toEqual(["wedding-guest", "male-guest", "kid", "crew"]);
    // The crew figure's kind is «other», which is a kind like the others.
    const crew = (await get(ctx, both)).persons[0]?.figures.find((figure) => figure.id === "crew");
    expect(crew?.type).toBe("other");
  });

  it("[AVA-02] a choice is stored; until then the first figure the person may choose applies", async () => {
    const { ctx } = await setup();
    const vip = await userWith(ctx, "gast", ["vip"]);
    const before = (await get(ctx, vip)).persons[0];
    expect(before).toMatchObject({ figure: "wedding-guest", chosen: false });
    const chosen = await put(ctx, vip, "me", "kid");
    expect(chosen.statusCode).toBe(200);
    expect((await get(ctx, vip)).persons[0]).toMatchObject({ figure: "kid", chosen: true });
  });

  it("[AVA-01][AVA-02] a staff-only user in a world without tier2 figures gets the tier1 figures and may choose one", async () => {
    // The test world's tier2 figure becomes tier1: the world has no figure for staff (decision 2 of 5l).
    const files = testWorldFiles();
    const figures = JSON.parse(files["avatar/figures.json"]?.toString("utf8") ?? "{}") as {
      figures: { id: string; tier: string }[];
    };
    for (const figure of figures.figures) if (figure.id === "crew") figure.tier = "tier1";
    files["avatar/figures.json"] = Buffer.from(JSON.stringify(figures));
    const ctx = await createTestApp();
    context = ctx;
    ctx.event.setSetting("platformOpen", true, "cli");
    const admin = await signIn(ctx, "boss", ["admin"]);
    const imported = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/world",
      headers: { ...admin, "content-type": "application/vnd.zappaloo.world" },
      payload: buildArchive(files),
    });
    expect(imported.statusCode).toBe(200);
    const crew = await userWith(ctx, "crew", ["staff"]);
    expect(idsOf(await get(ctx, crew))).toEqual(["wedding-guest", "male-guest", "kid", "crew"]);
    expect((await put(ctx, crew, "me", "kid")).statusCode).toBe(200);
    expect((await get(ctx, crew)).persons[0]).toMatchObject({ figure: "kid", chosen: true });
  });

  it("[AVA-01] a vip-only user cannot choose a tier2 figure, even though the world has one", async () => {
    const { ctx } = await setup();
    const vip = await userWith(ctx, "gast", ["vip"]);
    expect((await put(ctx, vip, "me", "crew")).statusCode).toBe(403);
    expect(idsOf(await get(ctx, vip))).not.toContain("crew");
  });

  it("[AVA-01] the server refuses a figure the person may not choose, one the world does not have, and a stranger's companion", async () => {
    const { ctx } = await setup();
    const vip = await userWith(ctx, "gast", ["vip"]);
    expect((await put(ctx, vip, "me", "crew")).statusCode).toBe(403);
    expect((await put(ctx, vip, "me", "pastor")).statusCode).toBe(403);
    expect((await put(ctx, vip, "me", "gibt-es-nicht")).statusCode).toBe(422);
    expect((await put(ctx, vip, "999", "kid")).statusCode).toBe(404);
    expect((await get(ctx, vip)).persons[0]?.chosen).toBe(false);
  });

  it("[AVA-02] a figure that the person may no longer choose falls back to the first they may choose", async () => {
    const { ctx } = await setup();
    const both = await userWith(ctx, "beides", ["vip", "staff"]);
    expect((await put(ctx, both, "me", "crew")).statusCode).toBe(200);
    // The staff role is revoked: tier2 is no longer allowed.
    ctx.auth.accounts.setRoles(await idOf(ctx, both), ["vip"], "cli");
    const after = (await get(ctx, both)).persons[0];
    expect(after?.figure).toBe("wedding-guest");
  });

  it("[AVA-01][AVA-02] companions choose their own figure, always from tier1, even when the guest is staff", async () => {
    const { ctx } = await setup();
    const host = await userWith(ctx, "gast", ["vip", "staff"]);
    const hostId = await idOf(ctx, host);
    const insert = (name: string, status: "approved" | "pending") =>
      ctx.database.db
        .insert(companions)
        .values({
          eventId: "event1",
          hostUserId: hostId,
          name,
          status,
          createdAt: new Date(),
        })
        .returning({ id: companions.id })
        .get().id;
    const mia = insert("Mia", "approved");
    insert("Noch offen", "pending");
    const response = await get(ctx, host);
    // Only approved companions have a tab.
    expect(response.persons.map((person) => person.name)).toEqual(["gast", "Mia"]);
    expect(idsOf(response, String(mia))).toEqual(["wedding-guest", "male-guest", "kid"]);
    expect((await put(ctx, host, String(mia), "crew")).statusCode).toBe(403);
    expect((await put(ctx, host, String(mia), "kid")).statusCode).toBe(200);
    const after = await get(ctx, host);
    expect(after.persons.find((person) => person.id === String(mia))).toMatchObject({
      figure: "kid",
      chosen: true,
    });
    // The guest's own choice is not changed by it.
    expect(after.persons[0]?.chosen).toBe(false);
  });

  it("[AVA-01] the editor needs a signed-in user", async () => {
    const { ctx } = await setup();
    expect((await ctx.app.inject({ url: "/api/avatar" })).statusCode).toBe(401);
  });
});
