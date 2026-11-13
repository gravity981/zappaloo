import { afterEach, describe, expect, it } from "vitest";
import type { ProgrammeResponse, WebsiteResponse } from "@zappaloo/shared";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { WebsiteService } from "./service.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const DAY_BEFORE = new Date("2027-06-11T12:00:00.000Z");
const EVENT_DAY = new Date("2027-06-12T11:00:00.000Z"); // 13:00 in Zurich

/** Two program items on the event day (12:00 and 13:30 in Zurich); the first one ends at 12:45. */
async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  const admin = await signIn(ctx, "boss", ["admin"]);
  const trauung = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/rsvp/program-items",
    headers: admin,
    payload: {
      name: "Trauung",
      startsAt: "2027-06-12T10:00:00.000Z",
      endsAt: "2027-06-12T10:45:00.000Z",
    },
  });
  const apero = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/rsvp/program-items",
    headers: admin,
    payload: { name: "Apéro", startsAt: "2027-06-12T11:30:00.000Z" },
  });
  const website = new WebsiteService(ctx.database, ctx.event, ctx.auth.rsvp);
  return {
    ctx,
    admin,
    trauung: trauung.json<{ id: number }>(),
    apero: apero.json<{ id: number }>(),
    website,
  };
}

describe("the website and the programme (WEB-07, WEB-09, WEB-10)", () => {
  it("[WEB-11] the day before the event the countdown counts, and there is no now or next", async () => {
    const { website } = await setup();
    const body: WebsiteResponse = website.website(DAY_BEFORE);
    expect(body.eventDay).toBe(false);
    expect(body.eventDate).toBe("2027-06-12");
    expect(body.countdown?.days).toBe(1);
    expect(body.now).toBeNull();
    expect(body.next).toBeNull();
  });

  it("[WEB-07][WEB-10] on the event day the start page shows now and next, and no countdown", async () => {
    const { website, trauung, apero } = await setup();
    const body = website.website(EVENT_DAY);
    expect(body.eventDay).toBe(true);
    expect(body.countdown).toBeNull();
    expect(body.now).toBeNull();
    expect(body.next?.id).toBe(apero.id);
    const duringTrauung = website.website(new Date("2027-06-12T10:20:00.000Z"));
    expect(duringTrauung.now?.id).toBe(trauung.id);
    expect(duringTrauung.now?.endsAt).toBe("2027-06-12T10:45:00.000Z");
  });

  it("[WEB-09] the programme lists only the items the guest is invited to, with their status", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const anna = await signIn(ctx, "anna", ["vip"]);
    const userId = ctx.auth.accounts.findUser("anna")?.id ?? 0;
    expect(
      (
        await ctx.app.inject({
          method: "PUT",
          url: `/api/admin/users/${String(userId)}/program-items`,
          headers: admin,
          payload: { programItemIds: [apero.id] },
        })
      ).statusCode,
    ).toBe(200);
    expect(anna).toBeDefined();
    const programme: ProgrammeResponse = website.programme(userId, EVENT_DAY);
    expect(programme.items.map((item) => item.name)).toEqual(["Apéro"]);
    expect(programme.hidden).toBe(true);
    expect(programme.items[0]?.status).toBe("upcoming");
    expect(programme.items.some((item) => item.id === trauung.id)).toBe(false);
    // Outside the event day nothing is greyed out or marked.
    expect(website.programme(userId, DAY_BEFORE).items[0]?.status).toBe("upcoming");
  });

  it("[WEB-07] an item ends after it starts: a wrong end is refused on create and on change", async () => {
    const { ctx, admin, apero } = await setup();
    const wrong = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/rsvp/program-items",
      headers: admin,
      payload: {
        name: "Party",
        startsAt: "2027-06-12T20:00:00.000Z",
        endsAt: "2027-06-12T19:00:00.000Z",
      },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json<{ error: { code: string } }>().error.code).toBe("invalid_time");
    const changed = await ctx.app.inject({
      method: "PATCH",
      url: `/api/admin/rsvp/program-items/${String(apero.id)}`,
      headers: admin,
      payload: { endsAt: "2027-06-12T11:00:00.000Z" },
    });
    expect(changed.statusCode).toBe(400);
    const ended = await ctx.app.inject({
      method: "PATCH",
      url: `/api/admin/rsvp/program-items/${String(apero.id)}`,
      headers: admin,
      payload: { endsAt: "2027-06-12T13:00:00.000Z" },
    });
    expect(ended.json<{ endsAt: string }>().endsAt).toBe("2027-06-12T13:00:00.000Z");
  });
});
