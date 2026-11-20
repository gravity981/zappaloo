import { describe, expect, it } from "vitest";
import {
  buildErrorDetails,
  browserName,
  detailsAsText,
  errorKind,
  errorNumber,
} from "./errorDetails.ts";

const context = {
  path: "/game?invitation=SECRET#top",
  now: new Date("2026-11-20T10:42:07Z"),
  version: "2.1.0",
  commit: "fcff293",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
};

describe("error details", () => {
  it("[WEB-13] a module that cannot be loaded is told from other errors", () => {
    expect(
      errorKind(new TypeError("Failed to fetch dynamically imported module: /assets/x.js")),
    ).toBe("module");
    expect(errorKind(new Error("Importing a module script failed."))).toBe("module");
    expect(
      errorKind(
        new SyntaxError("The requested module '/a.ts' doesn't provide an export named: 'b'"),
      ),
    ).toBe("module");
    expect(errorKind(new TypeError("Cannot read properties of undefined (reading 'lines')"))).toBe(
      "other",
    );
    expect(errorKind("something else")).toBe("other");
  });

  it("[WEB-14] the details name number, message, page without query, time in UTC, version, commit, browser and stack", () => {
    const error = new Error("boom");
    const details = buildErrorDetails(error, context);
    expect(details).toMatchObject({
      kind: "other",
      message: "boom",
      page: "/game",
      time: "2026-11-20T10:42:07.000Z",
      version: "2.1.0",
      commit: "fcff293",
      browser: "Safari 18.1 on iOS 18.1",
    });
    expect(details.number).toMatch(/^E-[0-9A-F]{6}$/);
    expect(details.stack).toContain("boom");
  });

  it("[WEB-14] the details hold no query, fragment or full user agent", () => {
    const text = detailsAsText(buildErrorDetails(new Error("boom"), context), {
      number: "Nr.",
      message: "Meldung",
      page: "Seite",
      time: "Zeit",
      version: "Version",
      browser: "Browser",
    });
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("Mozilla");
    expect(text).toContain("Seite: /game\n");
    expect(text).toContain("Version: 2.1.0 (fcff293)");
    expect(text).toContain("Zeit: 2026-11-20T10:42:07.000Z (UTC)");
  });

  it("[WEB-14] the error number is the same for the same message and page, and differs otherwise", () => {
    expect(errorNumber("a", "/x")).toBe(errorNumber("a", "/x"));
    expect(errorNumber("a", "/x")).not.toBe(errorNumber("b", "/x"));
    expect(errorNumber("a", "/x")).not.toBe(errorNumber("a", "/y"));
  });

  it("[WEB-14] the browser is named with its version and system, and unknown ones do not fail", () => {
    expect(
      browserName(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome 131.0.0.0 on Linux");
    expect(browserName("curl/8.0")).toBe("unknown");
  });
});
