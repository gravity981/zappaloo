import { afterEach, describe, expect, it } from "vitest";
import { IMAGE_MAX_BYTES } from "@zappaloo/shared";
import type { ContentImage, ContentResponse, ProgramItem } from "@zappaloo/shared";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
]);

/** The JSON body of a response, typed by the caller. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body type
const bodyOf = <T>(response: { json: () => unknown }): T => response.json() as T;

const errorCode = (response: { json: () => unknown }) =>
  bodyOf<{ error: { code: string } }>(response).error.code;

/** Lets `username` edit website content as a staff member with the capability (ROLE-06). */
async function staffWithContentCapability(ctx: TestContext, username: string): Promise<Headers> {
  const headers = await signIn(ctx, username, ["staff"]);
  const user = ctx.auth.accounts.findUser(username);
  if (!user) throw new Error("no such user");
  ctx.auth.accounts.setCapabilities(user.id, ["editWebsiteContent"], "cli");
  return headers;
}

function upload(ctx: TestContext, headers: Headers, bytes: Buffer, contentType: string) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/content/images",
    headers: { ...headers, "content-type": contentType },
    payload: bytes,
  });
}

function createPlace(ctx: TestContext, headers: Headers, changes: Record<string, unknown> = {}) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/content/places",
    headers,
    payload: {
      name: "Kirche Muri",
      address: "Kirchstrasse 1",
      mapsUrl: null,
      mapImageId: null,
      ...changes,
    },
  });
}

/** The id of the place called `name` in the content response of `response`. */
function placeId(response: { json: () => unknown }, name: string): number {
  const place = bodyOf<ContentResponse>(response).places.find((p) => p.name === name);
  if (!place) throw new Error(`no place ${name}`);
  return place.id;
}

const page = (placeIds: number[]) => ({
  slug: "anreise-parkieren",
  title: "Anreise & Parkieren",
  markdown: "Mit dem Zug bis Muri.",
  inMore: true,
  placeIds,
});

describe("images (CNT-06)", () => {
  it("[CNT-06][ROLE-06] an admin uploads an image, lists it and the signed-in users see it", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const sent = await upload(ctx, admin, JPEG, "image/jpeg");
    expect(sent.statusCode).toBe(200);
    const image = bodyOf<{ image: ContentImage }>(sent).image;
    expect(image.mime).toBe("image/jpeg");

    const listed = await ctx.app.inject({ url: "/api/content/images", headers: admin });
    expect(bodyOf<{ images: ContentImage[] }>(listed).images.map((i) => i.id)).toEqual([image.id]);

    const served = await ctx.app.inject({
      url: `/api/content/images/${String(image.id)}`,
      headers: admin,
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/jpeg");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.rawPayload.equals(JPEG)).toBe(true);
  });

  it("[CNT-06] the type is taken from the content, not from the sent type", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const sent = await upload(ctx, admin, PNG, "image/webp");
    expect(sent.statusCode).toBe(200);
    expect(bodyOf<{ image: ContentImage }>(sent).image.mime).toBe("image/png");
    const webp = await upload(ctx, admin, WEBP, "image/png");
    expect(bodyOf<{ image: ContentImage }>(webp).image.mime).toBe("image/webp");
  });

  it("[CNT-06] a wrong type behind a right name is refused, and so is an oversized file", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const text = await upload(ctx, admin, Buffer.from("Das ist kein Bild."), "image/jpeg");
    expect(text.statusCode).toBe(415);
    expect(errorCode(text)).toBe("image_type");

    const huge = Buffer.concat([PNG, Buffer.alloc(IMAGE_MAX_BYTES)]);
    const tooLarge = await upload(ctx, admin, huge, "image/png");
    expect(tooLarge.statusCode).toBe(413);
  });

  it("[CNT-06] images need a signed-in user, and only editors upload them", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const sent = await upload(ctx, admin, JPEG, "image/jpeg");
    const id = bodyOf<{ image: ContentImage }>(sent).image.id;

    const anonymous = await ctx.app.inject({ url: `/api/content/images/${String(id)}` });
    expect(anonymous.statusCode).toBe(401);

    const guest = await signIn(ctx, "anna", ["vip"]);
    // While the platform is closed a guest gets no page of the website, images included (ACS-10).
    const closed = await ctx.app.inject({
      url: `/api/content/images/${String(id)}`,
      headers: guest,
    });
    expect(closed.statusCode).toBe(403);
    const denied = await upload(ctx, guest, JPEG, "image/jpeg");
    expect(denied.statusCode).toBe(403);

    const staff = await signIn(ctx, "ben", ["staff"]);
    expect((await upload(ctx, staff, JPEG, "image/jpeg")).statusCode).toBe(403);
    const editor = await staffWithContentCapability(ctx, "lea");
    expect((await upload(ctx, editor, JPEG, "image/jpeg")).statusCode).toBe(200);
  });

  it("[CNT-06] an unknown image is not found", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const missing = await ctx.app.inject({ url: "/api/content/images/999", headers: admin });
    expect(missing.statusCode).toBe(404);
  });
});

describe("places (CNT-07)", () => {
  it("[CNT-07] a place has a name, an address, a Google Maps link and a map image of the event", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const image = bodyOf<{ image: ContentImage }>(await upload(ctx, admin, PNG, "image/png"));

    const created = await createPlace(ctx, admin, {
      mapsUrl: "https://maps.app.goo.gl/AbC123",
      mapImageId: image.image.id,
    });
    expect(created.statusCode).toBe(200);
    const place = bodyOf<ContentResponse>(created).places[0];
    if (!place) throw new Error("the place was not saved");
    expect(place).toMatchObject({
      name: "Kirche Muri",
      address: "Kirchstrasse 1",
      mapsUrl: "https://maps.app.goo.gl/AbC123",
      mapImageId: image.image.id,
    });

    const unknownImage = await createPlace(ctx, admin, { name: "Schloss", mapImageId: 999 });
    expect(unknownImage.statusCode).toBe(404);
    expect(errorCode(unknownImage)).toBe("image_not_found");
  });

  it("[CNT-07] only https links to Google Maps are accepted", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    for (const link of [
      "http://maps.google.com/?q=Muri",
      "https://example.com/maps",
      "https://www.google.com/search?q=Muri",
    ]) {
      const refused = await createPlace(ctx, admin, { mapsUrl: link });
      expect(refused.statusCode, link).toBe(400);
    }
  });

  it("[CNT-07][RSVP-05] a program item refers to a place; a used place cannot be deleted", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const placed = await createPlace(ctx, admin);
    const id = placeId(placed, "Kirche Muri");

    const item = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/rsvp/program-items",
      headers: admin,
      payload: { name: "Trauung", startsAt: "2027-06-12T12:00:00.000Z", placeId: id },
    });
    expect(item.statusCode).toBe(201);
    const made = bodyOf<ProgramItem>(item);
    expect(made).toMatchObject({ placeId: id, place: "Kirche Muri" });

    const inUse = await ctx.app.inject({
      method: "DELETE",
      url: `/api/content/places/${String(id)}`,
      headers: admin,
    });
    expect(inUse.statusCode).toBe(409);
    expect(errorCode(inUse)).toBe("place_in_use");

    const released = await ctx.app.inject({
      method: "PATCH",
      url: `/api/admin/rsvp/program-items/${String(made.id)}`,
      headers: admin,
      payload: { placeId: null },
    });
    expect(released.statusCode).toBe(200);
    const deleted = await ctx.app.inject({
      method: "DELETE",
      url: `/api/content/places/${String(id)}`,
      headers: admin,
    });
    expect(deleted.statusCode).toBe(200);
  });

  it("[CNT-07] a program item names a place of the event, and a page lists places it knows", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const id = placeId(await createPlace(ctx, admin), "Kirche Muri");

    const unknownItem = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/rsvp/program-items",
      headers: admin,
      payload: { name: "Apéro", startsAt: "2027-06-12T13:00:00.000Z", placeId: 999 },
    });
    expect(unknownItem.statusCode).toBe(404);
    expect(errorCode(unknownItem)).toBe("place_not_found");

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/content/pages",
      headers: admin,
      payload: page([id]),
    });
    expect(created.statusCode).toBe(200);
    const body = bodyOf<ContentResponse>(created);
    expect(body.pages[0]?.placeIds).toEqual([id]);

    const unknownPage = await ctx.app.inject({
      method: "POST",
      url: "/api/content/pages",
      headers: admin,
      payload: { ...page([999]), slug: "faq" },
    });
    expect(unknownPage.statusCode).toBe(404);
    expect(errorCode(unknownPage)).toBe("place_not_found");

    const inUse = await ctx.app.inject({
      method: "DELETE",
      url: `/api/content/places/${String(id)}`,
      headers: admin,
    });
    expect(inUse.statusCode).toBe(409);
  });

  it("[CNT-07] a page that stops listing a place lets the place go", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const id = placeId(await createPlace(ctx, admin), "Kirche Muri");
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/content/pages",
      headers: admin,
      payload: page([id]),
    });
    const pageId = bodyOf<ContentResponse>(created).pages[0]?.id ?? 0;

    const changed = await ctx.app.inject({
      method: "PUT",
      url: `/api/content/pages/${String(pageId)}`,
      headers: admin,
      payload: page([]),
    });
    expect(bodyOf<ContentResponse>(changed).pages[0]?.placeIds).toEqual([]);
    const deleted = await ctx.app.inject({
      method: "DELETE",
      url: `/api/content/places/${String(id)}`,
      headers: admin,
    });
    expect(deleted.statusCode).toBe(200);
  });
});
