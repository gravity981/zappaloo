// A fake backend for component tests: fetch answers from handlers, plus fixtures and helpers.
import { fireEvent, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { routes } from "../app/routes.tsx";

export const anna = {
  id: 1,
  username: "anna",
  displayName: "Anna",
  email: null,
  emailStatus: "unverified",
  roles: ["vip"],
  capabilities: [],
};
export const event = {
  id: "event1",
  name: "Event Muster",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
  setupComplete: true,
  features: {
    minigames: true,
    snapshots: true,
    gallery: true,
    keepsakes: true,
    rsvp: true,
    treasureHunt: true,
    eventScreen: true,
  },
  settings: { platformOpen: false, snapshotUploadsOpen: false, keepsakeUploadsOpen: false },
};

export interface Call {
  method: string;
  path: string;
  body: unknown;
  csrf: string | null;
}

/** A fake backend: `handlers` map "METHOD /path" to a status and body. */
export function fakeBackend(handlers: Record<string, () => { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({
        method,
        path,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        csrf: headers.get("x-csrf-token"),
      });
      if (path === "/api/version")
        return Promise.resolve(Response.json({ version: "0.0.0", commit: "x" }));
      if (path === "/api/event" && !handlers["GET /api/event"])
        return Promise.resolve(Response.json(event));
      const handler = handlers[`${method} ${path}`];
      if (!handler)
        return Promise.resolve(
          Response.json({ error: { code: "not_found", message: "?" } }, { status: 404 }),
        );
      const { status, body } = handler();
      return Promise.resolve(
        status === 204 ? new Response(null, { status }) : Response.json(body, { status }),
      );
    }),
  );
  return calls;
}

export function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

/** Fills a field and clicks buttons like a user (no extra dependency needed). */
export const user = {
  type(field: HTMLElement, text: string) {
    fireEvent.change(field, { target: { value: text } });
  },
  clear(field: HTMLElement) {
    fireEvent.change(field, { target: { value: "" } });
  },
  click(element: HTMLElement) {
    fireEvent.click(element);
  },
};

export const anonymous = { status: 200, body: { user: null, csrfToken: null } };
export const signedIn = { status: 200, body: { user: anna, csrfToken: "csrf-1" } };
