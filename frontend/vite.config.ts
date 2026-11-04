import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { gitLastRelease } from "../scripts/version/git.ts";
import { devVersion } from "../shared/src/version.ts";

// SEC-10 also in dev: the Vite dev and preview servers send the same header as the backend.
const noIndexHeaders = { "X-Robots-Tag": "noindex, nofollow, noarchive" };

// OPS-08: the image build passes APP_VERSION, so backend and frontend of one
// image report the same version; elsewhere the build is `<last release>+dev`.
const appVersion = process.env.APP_VERSION ?? devVersion(gitLastRelease());

// In dev, Vite serves the frontend and forwards API calls and robots.txt to the
// backend (npm run dev:backend). In production the backend serves the built files.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    headers: noIndexHeaders,
    proxy: {
      "/api": "http://localhost:3000",
      "/robots.txt": "http://localhost:3000",
    },
  },
  preview: { headers: noIndexHeaders },
  build: {
    // Phaser alone is ~1.2 MB; it is loaded lazily with the game route.
    chunkSizeWarningLimit: 1600,
  },
});
