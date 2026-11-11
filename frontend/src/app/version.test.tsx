import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import VersionFooter from "./VersionFooter.tsx";
import { displayVersion } from "./version.ts";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function serverReports(version: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ version, commit: "abc" }))),
  );
}

describe("version in the footer", () => {
  it("[OPS-08] shows the compiled-in version, or the server's if it only adds -rc.N", () => {
    expect(displayVersion("1.2.0")).toBe("1.2.0");
    expect(displayVersion("1.2.0", "1.2.0")).toBe("1.2.0");
    expect(displayVersion("1.2.0", "1.2.0-rc.2")).toBe("1.2.0-rc.2");
    // Anything else is not a suffix of the same build: keep the compiled-in version.
    expect(displayVersion("1.2.0", "1.3.0")).toBe("1.2.0");
    expect(displayVersion("1.2.0", "1.2.0-beta")).toBe("1.2.0");
    expect(displayVersion("1.2.0", "1.2.0-rc.2x")).toBe("1.2.0");
  });

  it("[OPS-08] the website footer shows the version compiled in at build time", async () => {
    serverReports(`${__APP_VERSION__}-rc.3`);
    render(
      <MemoryRouter>
        <VersionFooter />
      </MemoryRouter>,
    );
    expect(await screen.findByText(`Version ${__APP_VERSION__}-rc.3`)).toBeInTheDocument();
  });

  it("[OPS-08] the footer still shows the compiled-in version when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(
      <MemoryRouter>
        <VersionFooter />
      </MemoryRouter>,
    );
    expect(await screen.findByText(`Version ${__APP_VERSION__}`)).toBeInTheDocument();
  });
});
