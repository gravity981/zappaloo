// The card "Design" on the settings page (THM-01, THM-03, THM-05; sw-architecture.md 19.7).
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, renderAt, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = () => ({ status: 200, body: { user: admin, csrfToken: "csrf-9" } });
const sommerfest = {
  name: "Sommerfest",
  formatVersion: 1,
  importedAt: "2026-11-12T17:04:00.000Z",
};

/** The file input of the card (the button "Design importieren" is its label). */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input on the page");
  return input;
}

describe("the card Design", () => {
  it("[THM-01] shows the active theme with its format and the time of the import", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/theme": () => ({ status: 200, body: { active: sommerfest } }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByText("Aktiv: Sommerfest")).toBeInTheDocument();
    expect(screen.getByText(/Format 1 · importiert am/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standard-Design verwenden" })).toBeInTheDocument();
  });

  it("[THM-01] without a theme the card says that the platform's default applies", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/theme": () => ({ status: 200, body: { active: null } }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByText("Es gilt das Standard-Design der Plattform.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Standard-Design verwenden" })).toBeNull();
  });

  it("[THM-03] a refused package lists every finding, and the active theme stays as it was", async () => {
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/theme": () => ({ status: 200, body: { active: sommerfest } }),
      "POST /api/admin/theme": () => ({
        status: 422,
        body: {
          error: { code: "theme_refused", message: "the package was refused" },
          findings: [
            {
              file: "icons/icon-192.png",
              code: "icon_size",
              detail: "200 × 200 instead of 192 × 192",
            },
            { file: "theme.json", code: "json_field", detail: 'unknown field "shadow"' },
          ],
        },
      }),
    });
    renderAt("/admin/settings");
    await screen.findByText("Aktiv: Sommerfest");
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "design.tar.gz", { type: "application/gzip" })] },
    });
    expect(await screen.findByText("Das Paket wurde abgelehnt")).toBeVisible();
    expect(screen.getByText(/icons\/icon-192\.png: falsche Grösse/)).toBeVisible();
    expect(screen.getByText(/theme\.json: Feld unbekannt oder ungültig/)).toBeVisible();
    expect(screen.getByText("Aktiv: Sommerfest")).toBeVisible();
    // The package was sent once; the status was not read again, so nothing changed.
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(
      calls.filter((call) => call.path === "/api/admin/theme" && call.method === "GET"),
    ).toHaveLength(1);
  });

  it("[THM-05] the return to the default takes a second click", async () => {
    let active: typeof sommerfest | null = sommerfest;
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/theme": () => ({ status: 200, body: { active } }),
      "DELETE /api/admin/theme": () => {
        active = null;
        return { status: 204 };
      },
    });
    renderAt("/admin/settings");
    await screen.findByText("Aktiv: Sommerfest");
    user.click(screen.getByRole("button", { name: "Standard-Design verwenden" }));
    // The first click only asks.
    await screen.findByRole("button", { name: "Ja, Standard-Design verwenden" });
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    user.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("button", { name: "Ja, Standard-Design verwenden" })).toBeNull();
    user.click(screen.getByRole("button", { name: "Standard-Design verwenden" }));
    user.click(await screen.findByRole("button", { name: "Ja, Standard-Design verwenden" }));
    await waitFor(() => {
      expect(screen.getByText("Es gilt das Standard-Design der Plattform.")).toBeVisible();
    });
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
  });
  it("[THM-01] an imported package becomes the active theme at once", async () => {
    let active: typeof sommerfest | null = null;
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/theme": () => ({ status: 200, body: { active } }),
      "POST /api/admin/theme": () => {
        active = sommerfest;
        return { status: 200, body: { active } };
      },
    });
    renderAt("/admin/settings");
    await screen.findByText("Es gilt das Standard-Design der Plattform.");
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "design.tar.gz", { type: "application/gzip" })] },
    });
    expect(await screen.findByText("Aktiv: Sommerfest")).toBeVisible();
    expect(screen.getByText("Das Design wurde importiert.")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });
});
