import { describe, expect, it } from "vitest";
import config from "../vite.config.ts";

// In dev, Vite serves the frontend and forwards what the backend serves to the backend. A path that
// is missing here works in production (one server) and is a 404 or the start page in dev.
describe("the dev server forwards the backend's paths (THM-01, PWA-02)", () => {
  const proxy = (config.server?.proxy ?? {}) as Record<string, { target: string }>;

  it("[THM-01] forwards the font files of the event's theme, which lie outside /api", () => {
    expect(proxy["/theme"]?.target).toBe("http://localhost:3000");
  });

  it("[THM-01][PWA-02] forwards the API, the manifest, the app icons and robots.txt", () => {
    for (const path of ["/api", "/manifest.webmanifest", "/app-icons", "/robots.txt"]) {
      expect(proxy[path]?.target, path).toBe("http://localhost:3000");
    }
  });
});
