import { afterEach, describe, expect, it } from "vitest";
import type { IssuedInvitation, User } from "@zappaloo/shared";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

function issue(ctx: TestContext, name: string): IssuedInvitation {
  const [issued] = ctx.auth.invitations.create([{ name }], undefined, "cli");
  if (!issued) throw new Error("no invitation");
  return { ...issued.invitation, code: issued.code, url: "" };
}

describe("the brand of the pages without sign-in (ACS-09, SEC-09)", () => {
  it("[ACS-09] GET /api/site gives the name and the footer's texts, without a sign-in", async () => {
    context = await createTestApp();
    const response = await context.app.inject("/api/site");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: "Event Muster",
      copyright: expect.stringMatching(/^© \d{4} Event Muster$/) as string,
      sourceUrl: "https://github.com/gravity981/zappaloo",
      theme: null,
    });
  });

  it("[ACS-09] before the setup the name and the copyright line are null", async () => {
    context = await createTestApp({ setup: false });
    expect((await context.app.inject("/api/site")).json()).toMatchObject({
      name: null,
      copyright: null,
    });
  });
});

describe("the email at registration (INV-07, ACC-09)", () => {
  it("[INV-07][ACC-09] a guest may give an email address when redeeming: it is stored unverified and signs nobody in", async () => {
    context = await createTestApp();
    const ctx = context;
    const invitation = issue(ctx, "Erika Huber");
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${invitation.code}/register`,
      payload: {
        username: "erika.huber",
        password: PASSWORD,
        email: "erika@example.ch",
        displayName: "Erika Huber",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ user: User }>().user).toMatchObject({
      email: "erika@example.ch",
      emailStatus: "unverified",
    });
    // Until the address is verified in the profile, only the username signs in (ACC-16).
    const byEmail = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "erika@example.ch", password: PASSWORD },
    });
    expect(byEmail.statusCode).toBe(401);
    const byName = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "erika.huber", password: PASSWORD },
    });
    expect(byName.statusCode).toBe(200);
  });

  it("[INV-07] the email stays optional, and an invalid one is refused before the code is used up", async () => {
    context = await createTestApp();
    const ctx = context;
    const invitation = issue(ctx, "Opa Hans");
    const bad = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${invitation.code}/register`,
      payload: { username: "opa.hans", password: PASSWORD, email: "keine-adresse" },
    });
    expect(bad.statusCode).toBe(400);
    const without = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${invitation.code}/register`,
      payload: { username: "opa.hans", password: PASSWORD },
    });
    expect(without.statusCode).toBe(201);
    expect(without.json<{ user: User }>().user.email).toBeNull();
  });
});
