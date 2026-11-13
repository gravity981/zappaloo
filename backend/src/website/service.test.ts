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
const DURING_TRAUUNG = new Date("2027-06-12T10:20:00.000Z");

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
  // Yes or no per program item (RSVP-11), so a guest can attend one item and decline the other.
  ctx.auth.rsvp.setPerItem(true, "test");
  const website = new WebsiteService(ctx.database, ctx.event, ctx.auth.rsvp);
  return {
    ctx,
    admin,
    trauung: trauung.json<{ id: number }>(),
    apero: apero.json<{ id: number }>(),
    website,
  };
}

/** A guest invited to the given program items, with no answer yet. */
async function guest(
  ctx: TestContext,
  admin: Record<string, string>,
  name: string,
  programItemIds: number[],
): Promise<number> {
  await signIn(ctx, name, ["vip"]);
  const userId = ctx.auth.accounts.findUser(name)?.id ?? 0;
  const put = await ctx.app.inject({
    method: "PUT",
    url: `/api/admin/users/${String(userId)}/program-items`,
    headers: admin,
    payload: { programItemIds },
  });
  expect(put.statusCode).toBe(200);
  return userId;
}

/** Answers yes for the items in `attending` and no for the other invited items. */
function answer(ctx: TestContext, userId: number, invited: number[], attending: number[]) {
  ctx.auth.rsvp.answer(
    userId,
    {
      attendance: invited.map((programItemId) => ({
        programItemId,
        attending: attending.includes(programItemId),
      })),
    },
    "test",
  );
}

describe("the website and the programme (WEB-07, WEB-09, WEB-10)", () => {
  it("[WEB-11] the day before the event the countdown counts, and there is no now or next", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const userId = await guest(ctx, admin, "anna", [trauung.id, apero.id]);
    answer(ctx, userId, [trauung.id, apero.id], [apero.id]);
    const body: WebsiteResponse = website.website(userId, DAY_BEFORE);
    expect(body.eventDay).toBe(false);
    expect(body.eventDate).toBe("2027-06-12");
    expect(body.countdown?.days).toBe(1);
    expect(body.now).toBeNull();
    expect(body.next).toBeNull();
  });

  it("[WEB-07][WEB-10] on the event day a guest who accepted sees now and next, and no countdown", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const userId = await guest(ctx, admin, "anna", [trauung.id, apero.id]);
    answer(ctx, userId, [trauung.id, apero.id], [apero.id]);
    const body = website.website(userId, EVENT_DAY);
    expect(body.eventDay).toBe(true);
    expect(body.countdown).toBeNull();
    expect(body.now).toBeNull();
    expect(body.next?.id).toBe(apero.id);
    const during = website.website(userId, DURING_TRAUUNG);
    expect(during.now?.id).toBe(trauung.id);
    expect(during.now?.endsAt).toBe("2027-06-12T10:45:00.000Z");
  });

  it("[WEB-07] on the event day a guest who declined every item sees no now or next", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const userId = await guest(ctx, admin, "anna", [trauung.id, apero.id]);
    answer(ctx, userId, [trauung.id, apero.id], []);
    const body = website.website(userId, EVENT_DAY);
    expect(body.eventDay).toBe(true);
    expect(body.now).toBeNull();
    expect(body.next).toBeNull();
    expect(website.website(userId, DURING_TRAUUNG).now).toBeNull();
  });

  it("[WEB-07] on the event day a guest who has not answered sees no now or next", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const userId = await guest(ctx, admin, "anna", [trauung.id, apero.id]);
    const body = website.website(userId, EVENT_DAY);
    expect(body.eventDay).toBe(true);
    expect(body.now).toBeNull();
    expect(body.next).toBeNull();
  });

  it("[WEB-07][WEB-09] the programme marks the current item only for a guest who accepted", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const accepted = await guest(ctx, admin, "anna", [trauung.id, apero.id]);
    answer(ctx, accepted, [trauung.id, apero.id], [trauung.id, apero.id]);
    const declined = await guest(ctx, admin, "ben", [trauung.id, apero.id]);
    answer(ctx, declined, [trauung.id, apero.id], []);
    const yes: ProgrammeResponse = website.programme(accepted, DURING_TRAUUNG);
    expect(yes.items.find((item) => item.id === trauung.id)?.status).toBe("now");
    const no: ProgrammeResponse = website.programme(declined, DURING_TRAUUNG);
    // The Trauung has started, so without the "now" marker it is past, not upcoming.
    expect(no.items.find((item) => item.id === trauung.id)?.status).toBe("past");
  });

  it("[WEB-09] the programme lists only the items the guest is invited to, with their status", async () => {
    const { ctx, admin, trauung, apero, website } = await setup();
    const userId = await guest(ctx, admin, "anna", [apero.id]);
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
