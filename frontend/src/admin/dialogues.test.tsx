// Erlebniswelt › Dialoge (CNT-02, CNT-03, CNT-08): the list, the editor with lines, the preview, the portrait, the id
// that can change, and deleting only by a long press and never while an object shows the dialogue.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, event, fakeBackend, hold, renderAt, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-1" } };

interface Fixture {
  id: string;
  npcName: string;
  lines: string[];
  portrait: number | null;
  usedBy: { map: string; mapName: string | null; object: string; label: string | null }[];
}

const pfarrer: Fixture = {
  id: "pfarrer",
  npcName: "Pfarrer Keller",
  lines: ["Grüss Gott!", "Die Trauung beginnt um **14:00**.", "Bis gleich!"],
  portrait: null,
  usedBy: [{ map: "kirche", mapName: "Kirche & Garten", object: "pfarrer", label: "Pfarrer" }],
};
const koch: Fixture = {
  id: "koch",
  npcName: "Koch",
  lines: ["Hunger?", "Es gibt Fondue."],
  portrait: null,
  usedBy: [],
};

const summary = (item: Fixture) => ({
  id: item.id,
  npcName: item.npcName,
  lines: item.lines.length,
  portrait: item.portrait !== null,
  usedBy: item.usedBy,
});

function backend(extra: Record<string, () => { status: number; body?: unknown }> = {}) {
  return fakeBackend({
    "GET /api/session": () => asAdmin,
    "GET /api/event": () => ({ status: 200, body: event }),
    "GET /api/admin/world": () => ({
      status: 200,
      body: { active: null, previous: null, guestAccess: true },
    }),
    "GET /api/admin/dialogues": () => ({
      status: 200,
      body: { dialogues: [summary(koch), summary(pfarrer)] },
    }),
    "GET /api/admin/dialogues/pfarrer": () => ({ status: 200, body: pfarrer }),
    "GET /api/admin/dialogues/koch": () => ({ status: 200, body: koch }),
    ...extra,
  });
}

async function openTab() {
  renderAt("/admin/world");
  user.click(await screen.findByRole("button", { name: "Dialoge" }));
}

describe("the list of dialogues", () => {
  it("[CNT-02] lists the dialogues with their id, number of lines and the objects that show them or «nicht verwendet»", async () => {
    backend();
    await openTab();
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Koch");
    expect(rows[0]).toHaveTextContent("koch · 2 Zeilen · nicht verwendet");
    expect(rows[1]).toHaveTextContent("Pfarrer Keller");
    expect(rows[1]).toHaveTextContent("pfarrer · 3 Zeilen · Kirche & Garten › pfarrer");
  });
});

describe("the editor", () => {
  it("[CNT-02] shows the name, the id, the lines, a preview of the first line and where the dialogue is used", async () => {
    backend();
    await openTab();
    user.click(await screen.findByRole("button", { name: "Dialog Pfarrer Keller bearbeiten" }));
    expect(await screen.findByLabelText("Name der Figur")).toHaveValue("Pfarrer Keller");
    expect(screen.getByLabelText(/Kennung/)).toHaveValue("pfarrer");
    expect(
      screen.getByText("In Tiled als contentId = pfarrer. Kleinbuchstaben, Ziffern und -."),
    ).toBeVisible();
    expect(screen.getByLabelText("Zeile 2")).toHaveValue("Die Trauung beginnt um **14:00**.");
    const preview = screen.getByTestId("dialogue-preview");
    expect(preview).toHaveTextContent("Grüss Gott!");
    expect(preview).toHaveTextContent("1 / 3 · Tippen für weiter");
    expect(screen.getByText("Kirche & Garten › pfarrer")).toBeVisible();
  });

  it("[CNT-02] lines are added, moved and removed, and saving sends the whole dialogue; a new id is edited from then on", async () => {
    const calls = backend({
      "PUT /api/admin/dialogues/koch": () => ({
        status: 200,
        body: {
          ...koch,
          id: "chef",
          npcName: "Chefkoch",
          lines: ["Es gibt Fondue.", "Hunger?", "Guten Appetit!"],
        },
      }),
      "GET /api/admin/dialogues/chef": () => ({ status: 200, body: koch }),
    });
    await openTab();
    user.click(await screen.findByRole("button", { name: "Dialog Koch bearbeiten" }));
    await screen.findByLabelText("Name der Figur");
    user.click(screen.getByRole("button", { name: "Zeile 1 nach unten" }));
    expect(screen.getByLabelText("Zeile 1")).toHaveValue("Es gibt Fondue.");
    user.click(screen.getByRole("button", { name: "+ Zeile" }));
    user.type(screen.getByLabelText("Zeile 3"), "Guten Appetit!");
    user.type(screen.getByLabelText("Name der Figur"), "Chefkoch");
    user.type(screen.getByLabelText(/Kennung/), "chef");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        id: "chef",
        npcName: "Chefkoch",
        lines: ["Es gibt Fondue.", "Hunger?", "Guten Appetit!"],
      });
    });
    expect(calls.find((call) => call.method === "PUT")?.path).toBe("/api/admin/dialogues/koch");
    expect(calls.find((call) => call.method === "PUT")?.csrf).toBe("csrf-1");
    expect(await screen.findByText("Gespeichert.")).toBeVisible();
    // The last remaining line cannot be removed.
    user.click(screen.getByRole("button", { name: "Zeile 3 entfernen" }));
    user.click(screen.getByRole("button", { name: "Zeile 2 entfernen" }));
    expect(screen.getByRole("button", { name: "Zeile 1 entfernen" })).toBeDisabled();
  });

  it("[CNT-02] a new dialogue is made, its portrait comes after the first saving, and an id that exists is reported", async () => {
    const calls = backend({
      "POST /api/admin/dialogues": () => ({
        status: 201,
        body: { ...koch, id: "braut", npcName: "Braut" },
      }),
      "GET /api/admin/dialogues/braut": () => ({
        status: 200,
        body: { ...koch, id: "braut", npcName: "Braut" },
      }),
    });
    await openTab();
    user.click(await screen.findByRole("button", { name: "+ Dialog" }));
    expect(
      await screen.findByText("Das Bild kannst du nach dem ersten Speichern hochladen."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    user.type(screen.getByLabelText("Name der Figur"), "Braut");
    user.type(screen.getByLabelText(/Kennung/), "braut");
    user.type(screen.getByLabelText("Zeile 1"), "Ja, ich will!");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({
        id: "braut",
        npcName: "Braut",
        lines: ["Ja, ich will!"],
      });
    });
  });

  it("[CNT-02] an id that exists already is reported and nothing changes", async () => {
    backend({
      "POST /api/admin/dialogues": () => ({
        status: 409,
        body: { error: { code: "dialogue_exists", message: "x" } },
      }),
    });
    await openTab();
    user.click(await screen.findByRole("button", { name: "+ Dialog" }));
    user.type(await screen.findByLabelText("Name der Figur"), "Koch");
    user.type(screen.getByLabelText(/Kennung/), "koch");
    user.type(screen.getByLabelText("Zeile 1"), "Hallo");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "schon einen Dialog mit dieser Kennung",
    );
  });
});

describe("the portrait (CNT-08)", () => {
  it("[CNT-08] a portrait is uploaded as its own bytes with its type and shown from its version, and can be removed", async () => {
    const calls = backend({
      "PUT /api/admin/dialogues/koch/portrait": () => ({
        status: 200,
        body: { ...koch, portrait: 77 },
      }),
      "DELETE /api/admin/dialogues/koch/portrait": () => ({ status: 200, body: koch }),
    });
    await openTab();
    user.click(await screen.findByRole("button", { name: "Dialog Koch bearbeiten" }));
    const input = await screen.findByLabelText("Bild der Figur auswählen");
    const file = new File([new Uint8Array([1, 2, 3])], "koch.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(calls.find((call) => call.path === "/api/admin/dialogues/koch/portrait")?.method).toBe(
        "PUT",
      );
    });
    expect(calls.find((call) => call.method === "PUT")?.contentType).toBe("image/png");
    const card = screen.getByText("Bild der Figur").closest("div") as HTMLElement;
    await waitFor(() => {
      expect(card.querySelector("img")).toHaveAttribute("src", "/api/dialogues/koch/portrait?v=77");
    });
    user.click(screen.getByRole("button", { name: "Bild entfernen" }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === "DELETE")).toBe(true);
    });
  });

  it("[CNT-08] a file that is no JPEG, PNG or WebP is refused in the browser, nothing is sent", async () => {
    const calls = backend();
    await openTab();
    user.click(await screen.findByRole("button", { name: "Dialog Koch bearbeiten" }));
    const input = await screen.findByLabelText("Bild der Figur auswählen");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "koch.gif", { type: "image/gif" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("JPEG, PNG oder WebP");
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });
});

describe("deleting (CNT-03)", () => {
  it("[CNT-03] «Dialog löschen» needs a long press; an unused dialogue is deleted and the list comes back", async () => {
    const calls = backend({ "DELETE /api/admin/dialogues/koch": () => ({ status: 204 }) });
    await openTab();
    user.click(await screen.findByRole("button", { name: "Dialog Koch bearbeiten" }));
    const button = await screen.findByRole("button", { name: "Dialog löschen" });
    user.click(button);
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    hold(button);
    await waitFor(() => {
      expect(calls.find((call) => call.method === "DELETE")?.path).toBe(
        "/api/admin/dialogues/koch",
      );
    });
    expect(await screen.findByRole("button", { name: "+ Dialog" })).toBeVisible();
  });

  it("[CNT-03] a dialogue that an object shows is not deleted, and the message names the objects", async () => {
    backend({
      "DELETE /api/admin/dialogues/pfarrer": () => ({
        status: 409,
        body: {
          error: { code: "dialogue_in_use", message: "x" },
          used: pfarrer.usedBy,
        },
      }),
    });
    await openTab();
    user.click(await screen.findByRole("button", { name: "Dialog Pfarrer Keller bearbeiten" }));
    hold(await screen.findByRole("button", { name: "Dialog löschen" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("noch gezeigt von");
    expect(within(alert).getByText(/Kirche & Garten › pfarrer/)).toBeVisible();
  });
});
