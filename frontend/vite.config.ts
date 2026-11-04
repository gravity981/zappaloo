import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SEC-10 also in dev: the Vite dev and preview servers send the same header as the backend.
const noIndexHeaders = { "X-Robots-Tag": "noindex, nofollow, noarchive" };

// In dev, Vite serves the frontend and forwards API calls and robots.txt to the
// backend (npm run dev:backend). In production the backend serves the built files.
export default defineConfig({
  plugins: [react()],
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
