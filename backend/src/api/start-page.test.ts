import { afterEach, describe, expect, it } from "vitest";
import type { ContentImage, ContentResponse, WebsiteResponse } from "@zappaloo/shared";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body type
const bodyOf = <T>(response: { json: () => unknown }): T => response.json() as T;

function upload(ctx: TestContext, headers: Headers, item: string) {
  return ctx.app.inject({
    method: "POST",
    url: `/api/content/images?item=${item}`,
    headers: { ...headers, "content-type": "image/jpeg" },
    payload: JPEG,
  });
}

function putStart(ctx: TestContext, headers: Headers, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: "PUT", url: "/api/content/start", headers, payload });
}

/** A program item starting in `days` days, at noon in Zurich (UTC+2 in summer). */
async function programItemIn(ctx: TestContext, admin: Headers, days: number) {
  const start = new Date(Date.now() + days * 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(start);
  return ctx.app.inject({
    method: "POST",
    url: "/api/admin/rsvp/program-items",
    headers: admin,
    payload: { name: "Trauung", startsAt: `${day}T10:00:00.000Z` },
  });
}

describe("the start page (WEB-10, WEB-11)", () => {
  it("[WEB-11] the website shows the countdown to the first program item, and the switch takes it away", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    // Without program items there is no card.
    const none = await ctx.app.inject({ url: "/api/website", headers: admin });
    expect(bodyOf<WebsiteResponse>(none).countdown).toBeNull();

    expect((await programItemIn(ctx, admin, 10)).statusCode).toBe(201);
    const shown = await ctx.app.inject({ url: "/api/website", headers: admin });
    const countdown = bodyOf<WebsiteResponse>(shown).countdown;
    expect(countdown?.days).toBeGreaterThanOrEqual(9);
    expect(countdown?.days).toBeLessThanOrEqual(10);

    // The switch is on by default; the admin switches it off on the start page.
    expect((await putStart(ctx, admin, { markdown: "Hallo", countdown: false })).statusCode).toBe(
      200,
    );
    const off = await ctx.app.inject({ url: "/api/website", headers: admin });
    expect(bodyOf<WebsiteResponse>(off).countdown).toBeNull();
  });

  it("[WEB-10][CNT-06] the start page keeps its hero image and alt text, and the image cannot be removed while it is the hero", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const image = bodyOf<{ image: ContentImage }>(await upload(ctx, admin, "start")).image;

    // A hero image needs its alt text.
    const noAlt = await putStart(ctx, admin, { markdown: "", heroImageId: image.id });
    expect(noAlt.statusCode).toBe(400);
    expect(bodyOf<{ error: { code: string } }>(noAlt).error.code).toBe("alt_required");

    const set = await putStart(ctx, admin, {
      markdown: "",
      heroImageId: image.id,
      heroAlt: "Das Paar vor der Kirche",
    });
    expect(set.statusCode).toBe(200);
    expect(bodyOf<ContentResponse>(set).start).toEqual({
      heroImageId: image.id,
      heroAlt: "Das Paar vor der Kirche",
      countdown: true,
    });

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/content/images/${String(image.id)}`,
      headers: admin,
    });
    expect(removed.statusCode).toBe(409);
    expect(bodyOf<{ error: { code: string } }>(removed).error.code).toBe("image_in_use");

    // Setting the hero to none frees the image.
    expect(
      (await putStart(ctx, admin, { markdown: "", heroImageId: null, heroAlt: null })).statusCode,
    ).toBe(200);
    const freed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/content/images/${String(image.id)}`,
      headers: admin,
    });
    expect(freed.statusCode).toBe(204);
  });

  it("[WEB-10][CNT-06] the hero image is an image of the start page, not of a page", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/content/pages",
      headers: admin,
      payload: { slug: "faq", title: "FAQ", markdown: "", inMore: true, placeIds: [] },
    });
    const pageId = bodyOf<ContentResponse>(created).pages[0]?.id ?? 0;
    const pageImage = bodyOf<{ image: ContentImage }>(
      await upload(ctx, admin, `page:${String(pageId)}`),
    ).image;
    const wrong = await putStart(ctx, admin, {
      markdown: "",
      heroImageId: pageImage.id,
      heroAlt: "Falsch",
    });
    expect(wrong.statusCode).toBe(404);
    expect(bodyOf<{ error: { code: string } }>(wrong).error.code).toBe("image_not_found");
  });
});
