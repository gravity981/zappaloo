import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { requireFeature } from "./event.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

describe("event API", () => {
  it("[CFG-05] GET /api/event returns the event with its current features and settings", async () => {
    context = await createTestApp();
    const who = await signIn(context);
    const response = await context.app.inject({ url: "/api/event", headers: who });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "event1",
      name: "Event Muster",
      timezone: "Europe/Zurich",
      setupComplete: true,
      features: { minigames: true, treasureHunt: true },
      settings: { platformOpen: false },
    });

    context.event.setSetting("platformOpen", true, "cli");
    expect((await context.app.inject({ url: "/api/event", headers: who })).json()).toMatchObject({
      settings: { platformOpen: true },
    });
  });

  it("[CFG-03] a disabled feature is unavailable in the API, and available again once enabled", async () => {
    context = await createTestApp();
    const { app, event } = context;
    // A feature route of the open platform (while it is closed, guests reach only the waiting page).
    event.setSetting("platformOpen", true, "cli");
    let calls = 0;
    app.get(
      "/api/gallery",
      {
        preHandler: requireFeature(event, "gallery"),
        schema: { querystring: z.strictObject({}) },
      },
      () => {
        calls += 1;
        return { photos: [] };
      },
    );

    const who = await signIn(context);
    expect((await app.inject({ url: "/api/gallery", headers: who })).statusCode).toBe(200);
    event.setFeature("gallery", false, "cli");

    const disabled = await app.inject({ url: "/api/gallery", headers: who });
    expect(disabled.statusCode).toBe(404);
    expect(disabled.json()).toEqual({
      error: {
        code: "feature_disabled",
        message: 'The feature "gallery" is not enabled for this event.',
      },
    });
    expect(calls).toBe(1); // the handler did not run

    event.setFeature("gallery", true, "cli");
    expect((await app.inject({ url: "/api/gallery", headers: who })).statusCode).toBe(200);
  });
});

describe("admin: features and settings", () => {
  const patch = (who: Record<string, string>, payload: Record<string, unknown>) => {
    if (!context) throw new Error("no app");
    return context.app.inject({ method: "PATCH", url: "/api/admin/event", headers: who, payload });
  };

  it("[CFG-05][CFG-03] the admin changes features and settings at runtime; each change is audited", async () => {
    context = await createTestApp();
    const admin = await signIn(context, "boss", ["admin"]);
    const response = await patch(admin, {
      features: { gallery: false },
      settings: { platformOpen: true },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      features: { gallery: false, minigames: true },
      settings: { platformOpen: true, snapshotUploadsOpen: false },
    });
    // Every request reads the new state at once.
    expect(context.event.isFeatureEnabled("gallery")).toBe(false);
    const boss = context.auth.accounts.findUser("boss");
    const actions = context.event
      .auditEntries()
      .filter((e) => e.actor === `user:${String(boss?.id)}`)
      .map((e) => [e.action, e.details]);
    expect(actions).toEqual(
      expect.arrayContaining([
        ["feature.set", { name: "gallery", from: true, to: false }],
        ["setting.set", { name: "platformOpen", from: false, to: true }],
      ]),
    );
    // An unchanged value is not logged again.
    const before = context.event.auditEntries().length;
    expect((await patch(admin, { features: { gallery: false } })).statusCode).toBe(200);
    expect(context.event.auditEntries()).toHaveLength(before);
  });

  it("[CFG-05][ROLE-08] needs the admin role and known names; nothing changes on a refused request", async () => {
    context = await createTestApp();
    const staff = await signIn(context, "helper", ["staff", "vip"]);
    expect((await patch(staff, { settings: { platformOpen: true } })).statusCode).toBe(403);
    const admin = await signIn(context, "boss", ["admin"]);
    for (const payload of [
      {},
      { features: {} },
      { features: { unknownFeature: true } },
      { settings: { platformOpen: "yes" } },
      { features: { gallery: false }, extra: 1 },
    ]) {
      expect((await patch(admin, payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(context.event.get().settings.platformOpen).toBe(false);
    expect(context.event.isFeatureEnabled("gallery")).toBe(true);
  });
});

describe("setup", () => {
  const setup = (who: Record<string, string>, payload: Record<string, unknown>) => {
    if (!context) throw new Error("no app");
    return context.app.inject({
      method: "POST",
      url: "/api/admin/event/setup",
      headers: who,
      payload,
    });
  };
  const input = { name: "Our Day", timezone: "Europe/Zurich", defaultLanguage: "de" };

  it("[CFG-02] a fresh installation is not set up; the admin completes the setup once, audited", async () => {
    context = await createTestApp({ setup: false });
    const admin = await signIn(context, "boss", ["admin"]);
    const fresh = await context.app.inject({ url: "/api/event", headers: admin });
    expect(fresh.json()).toMatchObject({ name: null, setupComplete: false });

    const done = await setup(admin, input);
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json()).toMatchObject({ ...input, setupComplete: true });
    const boss = context.auth.accounts.findUser("boss");
    expect(
      context.event
        .auditEntries()
        .filter((e) => e.action === "event.setup")
        .map((e) => [e.actor, e.details]),
    ).toEqual([[`user:${String(boss?.id)}`, input]]);

    const again = await setup(admin, input);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: "already_set_up" } });
  });

  it("[CFG-02][ROLE-08] needs the admin role and valid input; nothing is set up on a refused request", async () => {
    context = await createTestApp({ setup: false });
    const staff = await signIn(context, "helper", ["staff", "vip"]);
    expect((await setup(staff, input)).statusCode).toBe(403);
    const admin = await signIn(context, "boss", ["admin"]);
    for (const payload of [
      {},
      { ...input, name: " " },
      { ...input, timezone: "Mars/Olympus" },
      { ...input, defaultLanguage: "deu" },
      { name: "Our Day", timezone: "Europe/Zurich" },
      { ...input, slug: "our-day" },
    ]) {
      expect((await setup(admin, payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(context.event.get().setupComplete).toBe(false);
  });

  it("[CFG-02] before the setup, changes are refused and the routes of a feature answer setup_incomplete", async () => {
    context = await createTestApp({ setup: false });
    const { app, event } = context;
    app.get(
      "/api/gallery",
      {
        preHandler: requireFeature(event, "gallery"),
        schema: { querystring: z.strictObject({}) },
      },
      () => ({ photos: [] }),
    );
    const admin = await signIn(context, "boss", ["admin"]);
    const gallery = await app.inject({ url: "/api/gallery", headers: admin });
    expect(gallery.statusCode).toBe(409);
    expect(gallery.json()).toMatchObject({ error: { code: "setup_incomplete" } });
    const change = await app.inject({
      method: "PATCH",
      url: "/api/admin/event",
      headers: admin,
      payload: { settings: { platformOpen: true } },
    });
    expect(change.statusCode).toBe(409);
    expect(change.json()).toMatchObject({ error: { code: "setup_incomplete" } });

    await setup(admin, input);
    expect((await app.inject({ url: "/api/gallery", headers: admin })).statusCode).toBe(200);
  });

  it("[CFG-06] the admin changes name, time zone and default language later; each change is audited", async () => {
    context = await createTestApp();
    const admin = await signIn(context, "boss", ["admin"]);
    const response = await context.app.inject({
      method: "PATCH",
      url: "/api/admin/event",
      headers: admin,
      payload: { name: "Renamed", timezone: "Europe/Berlin" },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ name: "Renamed", timezone: "Europe/Berlin" });
    expect(
      context.event
        .auditEntries()
        .filter((e) => e.action === "event.set")
        .map((e) => e.details),
    ).toEqual([
      { name: "timezone", from: "Europe/Zurich", to: "Europe/Berlin" },
      { name: "name", from: "Event Muster", to: "Renamed" },
    ]);
    for (const payload of [{ timezone: "Mars/Olympus" }, { name: "" }, { defaultLanguage: "x" }]) {
      const refused = await context.app.inject({
        method: "PATCH",
        url: "/api/admin/event",
        headers: admin,
        payload,
      });
      expect(refused.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});
