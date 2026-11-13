import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { ActivityEntry, ContentResponse, ContentPage } from "@zappaloo/shared";
import { auditLog, contentTexts } from "../database/schema.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;

const page = (changes: Partial<Record<string, unknown>> = {}) => ({
  slug: "anreise-parkieren",
  title: "Anreise & Parkieren",
  markdown: "# Anreise\n\nMit dem Zug bis Muri.",
  inMore: true,
  ...changes,
});

async function get(ctx: TestContext, headers: Headers) {
  return ctx.app.inject({ url: "/api/content", headers });
}

async function send(
  ctx: TestContext,
  method: "POST" | "PUT" | "DELETE",
  url: string,
  headers: Headers,
  payload?: object,
) {
  return ctx.app.inject({ method, url, headers, payload });
}

/** Lets `username` edit website content as a staff member with the capability (ROLE-06). */
async function staffWithContentCapability(ctx: TestContext, username: string): Promise<Headers> {
  const headers = await signIn(ctx, username, ["staff"]);
  const user = ctx.auth.accounts.findUser(username);
  if (!user) throw new Error("no such user");
  ctx.auth.accounts.setCapabilities(user.id, ["editWebsiteContent"], "cli");
  return headers;
}

describe("the content base", () => {
  it("[CNT-04][LANG-02] a fresh installation has no pages and an empty start text", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const body = (await get(ctx, admin)).json<ContentResponse>();
    expect(body).toEqual({ startMarkdown: "", pages: [] });
  });

  it("[CNT-05] the admin creates, changes, orders and deletes pages; the change is live at once", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);

    const created = await send(ctx, "POST", "/api/content/pages", admin, page());
    expect(created.statusCode).toBe(200);
    await send(ctx, "POST", "/api/content/pages", admin, page({ slug: "faq", title: "FAQ" }));
    const pages = (await get(ctx, admin)).json<ContentResponse>().pages;
    expect(pages.map((p) => p.slug)).toEqual(["anreise-parkieren", "faq"]);
    expect(pages[0]).toMatchObject({ title: "Anreise & Parkieren", inMore: true, position: 0 });

    const [first, second] = pages as [ContentPage, ContentPage];
    const renamed = await send(
      ctx,
      "PUT",
      `/api/content/pages/${String(first.id)}`,
      admin,
      page({ title: "Anreise", markdown: "Neu", inMore: false }),
    );
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<ContentResponse>().pages[0]).toMatchObject({
      title: "Anreise",
      markdown: "Neu",
      inMore: false,
    });

    const reordered = await send(ctx, "PUT", "/api/content/order", admin, {
      ids: [second.id, first.id],
    });
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json<ContentResponse>().pages.map((p) => p.slug)).toEqual([
      "faq",
      "anreise-parkieren",
    ]);

    const deleted = await send(ctx, "DELETE", `/api/content/pages/${String(second.id)}`, admin);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<ContentResponse>().pages.map((p) => p.slug)).toEqual(["anreise-parkieren"]);
  });

  it("[CNT-05] the start page text is saved and read back", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const saved = await send(ctx, "PUT", "/api/content/start", admin, {
      markdown: "Herzlich willkommen!",
    });
    expect(saved.json<ContentResponse>().startMarkdown).toBe("Herzlich willkommen!");
    expect((await get(ctx, admin)).json<ContentResponse>().startMarkdown).toBe(
      "Herzlich willkommen!",
    );
  });

  it("[CNT-01] a page's title and text are kept once per language, however often it changes", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await send(ctx, "POST", "/api/content/pages", admin, page());
    const id = (await get(ctx, admin)).json<ContentResponse>().pages[0]?.id ?? 0;
    await send(ctx, "PUT", `/api/content/pages/${String(id)}`, admin, page({ title: "Zwei" }));
    await send(ctx, "PUT", `/api/content/pages/${String(id)}`, admin, page({ title: "Drei" }));
    const rows = ctx.database.db
      .select()
      .from(contentTexts)
      .where(and(eq(contentTexts.eventId, "event1"), eq(contentTexts.item, `page:${String(id)}`)))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ language: "de", title: "Drei" });
  });

  it("[LANG-02] every text is stored with its language key, German", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await send(ctx, "PUT", "/api/content/start", admin, { markdown: "Hallo" });
    const rows = ctx.database.db.select().from(contentTexts).all();
    expect(rows.map((row) => row.language)).toEqual(["de"]);
  });

  it("[CNT-05] a slug is an address part, and two pages cannot share it", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const invalid = await send(
      ctx,
      "POST",
      "/api/content/pages",
      admin,
      page({ slug: "Mit Leerzeichen" }),
    );
    expect(invalid.statusCode).toBe(400);
    await send(ctx, "POST", "/api/content/pages", admin, page());
    const taken = await send(ctx, "POST", "/api/content/pages", admin, page({ title: "Doppelt" }));
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: { code: "slug_taken" } });
  });

  it("[CNT-05] a page keeps its own address when only its text changes", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await send(ctx, "POST", "/api/content/pages", admin, page());
    const id = (await get(ctx, admin)).json<ContentResponse>().pages[0]?.id ?? 0;
    const updated = await send(
      ctx,
      "PUT",
      `/api/content/pages/${String(id)}`,
      admin,
      page({ markdown: "Anderer Text" }),
    );
    expect(updated.statusCode).toBe(200);
  });

  it("[CNT-05] an unknown page or an incomplete order is refused", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    expect((await send(ctx, "DELETE", "/api/content/pages/999", admin)).statusCode).toBe(404);
    expect((await send(ctx, "PUT", "/api/content/pages/999", admin, page())).statusCode).toBe(404);
    await send(ctx, "POST", "/api/content/pages", admin, page());
    await send(ctx, "POST", "/api/content/pages", admin, page({ slug: "faq", title: "FAQ" }));
    const partial = await send(ctx, "PUT", "/api/content/order", admin, { ids: [1] });
    expect(partial.statusCode).toBe(409);
    expect(partial.json()).toMatchObject({ error: { code: "order_mismatch" } });
  });
});

describe("who edits the content", () => {
  it("[ROLE-07] an admin edits the content; a guest cannot", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const guest = await signIn(ctx, "gast", ["vip"]);
    expect((await send(ctx, "POST", "/api/content/pages", guest, page())).statusCode).toBe(403);
    expect(
      (await send(ctx, "PUT", "/api/content/start", guest, { markdown: "x" })).statusCode,
    ).toBe(403);
    expect((await send(ctx, "POST", "/api/content/pages", admin, page())).statusCode).toBe(200);
  });

  it("[ROLE-06] staff edit the content only with the capability editWebsiteContent", async () => {
    context = await createTestApp();
    const ctx = context;
    const plain = await signIn(ctx, "helfer", ["staff"]);
    expect((await send(ctx, "POST", "/api/content/pages", plain, page())).statusCode).toBe(403);
    const capable = await staffWithContentCapability(ctx, "redaktion");
    expect((await send(ctx, "POST", "/api/content/pages", capable, page())).statusCode).toBe(200);
  });

  it("[ROLE-07][ROLE-08] an admin edits the content without the staff role", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    expect((await get(ctx, admin)).statusCode).toBe(200);
    expect(
      (await send(ctx, "PUT", "/api/content/start", admin, { markdown: "Hallo" })).statusCode,
    ).toBe(200);
  });

  it("[ACS-10] while the platform is closed, a guest cannot read the content, staff can", async () => {
    context = await createTestApp();
    const ctx = context;
    expect(ctx.event.settings().platformOpen).toBe(false);
    const guest = await signIn(ctx, "gast", ["vip"]);
    const refused = await get(ctx, guest);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: { code: "platform_closed" } });
    const staff = await signIn(ctx, "helfer", ["staff"]);
    expect((await get(ctx, staff)).statusCode).toBe(200);
  });

  it("[ACS-09] reading the content needs a signed-in user", async () => {
    context = await createTestApp();
    expect((await get(context, {})).statusCode).toBe(401);
  });
});

describe("the card Zuletzt (DATA-05)", () => {
  it("[DATA-05] content changes appear on the card with names, and the audit log holds ids only", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await send(ctx, "POST", "/api/content/pages", admin, page({ title: "Geheime Anreise" }));
    const id = (await get(ctx, admin)).json<ContentResponse>().pages[0]?.id ?? 0;
    await send(ctx, "PUT", `/api/content/pages/${String(id)}`, admin, page({ title: "Anreise" }));
    const activity = await ctx.app.inject({ url: "/api/admin/activity", headers: admin });
    const entries = activity.json<{ entries: ActivityEntry[] }>().entries;
    expect(entries.map((entry) => entry.action)).toContain("content.page.create");
    expect(entries.find((entry) => entry.action === "content.page.update")?.name).toBe("Anreise");
    const log = ctx.database.db
      .select({ details: auditLog.details, action: auditLog.action })
      .from(auditLog)
      .all()
      .filter((row) => row.action.startsWith("content."));
    expect(log.length).toBeGreaterThan(0);
    expect(log.map((row) => row.details).join(" ")).not.toContain("Anreise");
  });
});
