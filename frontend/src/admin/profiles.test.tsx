// The admin's side of the profiles (PRES-14, PRES-15): the relation list in Einstellungen and the removal of a
// photo or a line in the account panel.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, event, fakeBackend, renderAt, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-1" } };

describe("the relation list (PRES-15)", () => {
  it("[PRES-15] the admin renames, adds and removes options and saves the whole list with the ids of the kept ones", async () => {
    let list = [
      { id: 1, name: "Familie Braut" },
      { id: 2, name: "Arbeit" },
    ];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: event }),
      "GET /api/admin/profile/relations": () => ({ status: 200, body: { relations: list } }),
      "PUT /api/admin/profile/relations": () => {
        const body = calls.at(-1)?.body as { relations: { id?: number; name: string }[] };
        list = body.relations.map((entry, index) => ({
          id: entry.id ?? 10 + index,
          name: entry.name,
        }));
        return { status: 200, body: { relations: list } };
      },
    });
    renderAt("/admin/settings");
    const first = await screen.findByLabelText("Option 1");
    expect(screen.getByRole("button", { name: "Liste speichern" })).toBeDisabled();
    user.type(first, "Familie der Braut");
    user.click(screen.getByRole("button", { name: "Arbeit entfernen" }));
    user.click(screen.getByRole("button", { name: "Option hinzufügen" }));
    user.type(screen.getByLabelText("Option 2"), "Nachbarn");
    user.click(screen.getByRole("button", { name: "Liste speichern" }));
    await screen.findByText("Gespeichert.");
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      relations: [{ id: 1, name: "Familie der Braut" }, { name: "Nachbarn" }],
    });
  });

  it("[PRES-15] the last option cannot be removed", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: event }),
      "GET /api/admin/profile/relations": () => ({
        status: 200,
        body: { relations: [{ id: 1, name: "Arbeit" }] },
      }),
    });
    renderAt("/admin/settings");
    await screen.findByLabelText("Option 1");
    expect(screen.getByRole("button", { name: "Arbeit entfernen" })).toBeDisabled();
  });
});

describe("the removal of profile data (PRES-14)", () => {
  it("[PRES-14] the account panel shows a guest's profile and removes a line after a second click", async () => {
    let line: string | null = "Nachbar";
    const guest = {
      ...anna,
      id: 5,
      status: "active",
      vipAssignment: "invitation_code",
      personType: "adult",
      groups: [],
      invitedProgramItemIds: [],
    };
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({ status: 200, body: { users: [guest] } }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: { deadline: null, perItem: false, approvalRequired: true },
      }),
      "GET /api/admin/profiles/5": () => ({
        status: 200,
        body: {
          persons: [
            {
              id: "me",
              key: "u5",
              name: guest.displayName,
              greeting: "Hallo",
              relation: null,
              relationLine: line,
              photo: null,
            },
          ],
        },
      }),
      "DELETE /api/admin/profiles/u5/relationLine": () => {
        line = null;
        return { status: 204 };
      },
    });
    renderAt("/admin/users");
    user.click(
      await screen.findByRole("button", { name: `Konto ${guest.displayName} bearbeiten` }),
    );
    const panel = await screen.findByRole("dialog");
    const card = await within(panel).findByTestId("profile-u5");
    expect(within(card).getByText("Hallo")).toBeVisible();
    expect(within(card).getByText("Nachbar")).toBeVisible();
    user.click(within(card).getByRole("button", { name: "Zeile entfernen" }));
    // Nothing is sent before the second click.
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    user.click(within(card).getByRole("button", { name: "Ja, entfernen" }));
    await waitFor(() => {
      expect(calls.find((call) => call.method === "DELETE")?.path).toBe(
        "/api/admin/profiles/u5/relationLine",
      );
    });
    await waitFor(() => {
      expect(within(screen.getByTestId("profile-u5")).queryByText("Nachbar")).toBeNull();
    });
  });
});
