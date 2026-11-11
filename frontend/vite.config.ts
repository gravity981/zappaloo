import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { gitLastRelease } from "../scripts/version/git.ts";
import { devVersion } from "../shared/src/version.ts";

// SEC-10 also in dev: the Vite dev and preview servers send the same header as the backend.
const noIndexHeaders = { "X-Robots-Tag": "noindex, nofollow, noarchive" };

// OPS-08: the image build passes APP_VERSION, so backend and frontend of one
// image report the same version; elsewhere the build is `<last release>+dev`.
const appVersion = process.env.APP_VERSION ?? devVersion(gitLastRelease());

// In dev, Vite serves the frontend and forwards API calls, robots.txt, the manifest and the app icons to the
// backend (npm run dev:backend). In production the backend serves the built files.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    // All interfaces of the devcontainer: VS Code's port forwarding connects via
    // IPv4, while "localhost" alone resolves to ::1 here. The container itself is
    // only reachable through that forwarding.
    host: "0.0.0.0",
    port: 5173,
    // Fail instead of moving to another port that is not forwarded.
    strictPort: true,
    headers: noIndexHeaders,
    // The Host header stays the browser's (localhost:5173): the backend refuses a
    // state-changing request whose Origin differs from its Host (SEC-01).
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
      "/robots.txt": { target: "http://localhost:3000", changeOrigin: false },
      "/manifest.webmanifest": { target: "http://localhost:3000", changeOrigin: false },
      "/app-icons": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
  preview: { headers: noIndexHeaders },
  build: {
    // Phaser alone is ~1.2 MB; it is loaded lazily with the game route.
    chunkSizeWarningLimit: 1600,
  },
});
