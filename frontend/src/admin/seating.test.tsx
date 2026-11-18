// The admin's seating plan (PRES-05, PRES-06, PRES-07; UX mock `admin-seating`): placing persons by drag and drop or by
// tapping, the capacity, the date from which guests see the plan.
import { createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

const person = (key: string, name: string, companionOf: string | null = null, placed = false) => ({
  key,
  name,
  companionOf,
  placed,
});

/** A plan with two tables (one with a place left), one placed guest and two without a table. */
function plan(changes: Record<string, unknown> = {}) {
  return {
    visibleFrom: null,
    tables: [
      {
        name: "Edelweiss",
        map: "saal",
        mapName: "Saal",
        places: 3,
        persons: [person("u1", "Erika Huber", null, true)],
      },
      { name: "Enzian", map: "saal", mapName: "Saal", places: 1, persons: [] },
    ],
    unassigned: [person("u2", "Peter Graf"), person("c5", "Hans Graf", "Peter Graf")],
    ...changes,
  };
}

function backend(options: { full?: boolean; current?: () => unknown } = {}) {
  return fakeBackend({
    "GET /api/session": () => asAdmin,
    "GET /api/event": () => ({ status: 200, body: event }),
    "GET /api/admin/seating": () => ({ status: 200, body: options.current?.() ?? plan() }),
    "PUT /api/admin/seating/assignments/u2": () =>
      options.full === true
        ? { status: 409, body: { error: { code: "table_full", message: "x" } } }
        : { status: 200, body: plan() },
    "PUT /api/admin/seating/assignments/c5": () => ({ status: 200, body: plan() }),
    "PUT /api/admin/seating/visibility": () => ({ status: 200, body: plan() }),
  });
}

describe("the seating plan", () => {
  it("[PRES-05][PRES-07] shows the tables with how many places are taken, and those without a table, companions marked", async () => {
    backend();
    renderAt("/admin/seating");
    const edelweiss = await screen.findByTestId("table-Edelweiss");
    expect(within(edelweiss).getByText("1 / 3")).toBeVisible();
    expect(within(edelweiss).getByText("Erika Huber")).toBeVisible();
    expect(within(screen.getByTestId("table-Enzian")).getByText("0 / 1")).toBeVisible();
    const open = screen.getByTestId("seating-unassigned");
    expect(within(open).getByText("Peter Graf")).toBeVisible();
    expect(within(open).getByRole("button", { name: /Hans Graf/ })).toBeVisible();
    expect(screen.getByText("Noch ohne Platz (2)")).toBeVisible();
  });

  it("[PRES-05] tapping a person and then «Hierher» places them", async () => {
    const calls = backend();
    renderAt("/admin/seating");
    await screen.findByTestId("table-Edelweiss");
    user.click(screen.getByRole("button", { name: "Peter Graf" }));
    user.click(within(screen.getByTestId("table-Enzian")).getByRole("button", { name: "Hierher" }));
    await waitFor(() => {
      expect(calls.find((call) => call.method === "PUT")?.path).toBe(
        "/api/admin/seating/assignments/u2",
      );
    });
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ table: "Enzian" });
    expect(calls.find((call) => call.method === "PUT")?.csrf).toBe("csrf-1");
  });

  it("[PRES-05] dragging a person onto a table places them, and onto the list takes the place away", async () => {
    const calls = backend();
    renderAt("/admin/seating");
    const table = await screen.findByTestId("table-Enzian");
    // The drop carries the key of the dragged person in the data transfer.
    const drop = (target: HTMLElement, key: string) => {
      const dropEvent = createEvent.drop(target);
      Object.defineProperty(dropEvent, "dataTransfer", { value: { getData: () => key } });
      fireEvent(target, dropEvent);
    };
    drop(table, "u2");
    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    });
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ table: "Enzian" });
    drop(screen.getByRole("region", { name: /Noch ohne Platz/ }), "c5");
    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PUT")).toHaveLength(2);
    });
    expect(calls.filter((call) => call.method === "PUT")[1]?.body).toEqual({ table: null });
  });

  it("[PRES-05] a table without room says so and the person stays where they were", async () => {
    backend({ full: true });
    renderAt("/admin/seating");
    await screen.findByTestId("table-Enzian");
    user.click(screen.getByRole("button", { name: "Peter Graf" }));
    user.click(within(screen.getByTestId("table-Enzian")).getByRole("button", { name: "Hierher" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("keinen Platz mehr");
    expect(within(screen.getByTestId("seating-unassigned")).getByText("Peter Graf")).toBeVisible();
  });

  it("[PRES-05] a world without tables points to the seats of the world", async () => {
    backend({ current: () => plan({ tables: [] }) });
    renderAt("/admin/seating");
    expect(await screen.findByText(/Sitzplätze \(type = seat\)/)).toBeVisible();
  });
});

describe("the date from which guests see the plan", () => {
  it("[PRES-06] the date is set in the event's time zone and sent as an instant; an empty field hides the plan again", async () => {
    const calls = backend();
    renderAt("/admin/seating");
    const field = await screen.findByLabelText(/Für Gäste sichtbar ab/);
    user.type(field, "12.06.2027 08:00");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.some((call) => call.path === "/api/admin/seating/visibility")).toBe(true);
    });
    // Europe/Zurich is two hours ahead of UTC in June.
    expect(calls.find((call) => call.path === "/api/admin/seating/visibility")?.body).toEqual({
      visibleFrom: "2027-06-12T06:00:00.000Z",
    });
    user.clear(screen.getByLabelText(/Für Gäste sichtbar ab/));
    user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(
        calls.filter((call) => call.path === "/api/admin/seating/visibility").at(-1)?.body,
      ).toEqual({ visibleFrom: null });
    });
  });

  it("[PRES-06] the stored date is shown in the event's time zone", async () => {
    backend({ current: () => plan({ visibleFrom: "2027-06-12T06:00:00.000Z" }) });
    renderAt("/admin/seating");
    expect(await screen.findByLabelText(/Für Gäste sichtbar ab/)).toHaveValue("12.06.2027 08:00");
  });
});
