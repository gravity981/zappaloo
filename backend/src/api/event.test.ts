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
      id: "event-muster",
      name: "Event Muster",
      timezone: "Europe/Zurich",
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
