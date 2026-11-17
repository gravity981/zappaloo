import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { worldPreviewServer } from "./src/server/vite-plugin.ts";

export default defineConfig(({ command }) => {
  if (command !== "serve") {
    throw new Error("The game preview is a development server and cannot be built for production");
  }
  if (process.env.APP_ENV !== "dev") {
    throw new Error("Run the game preview only in the development environment (APP_ENV=dev)");
  }
  return {
    plugins: [react(), worldPreviewServer()],
    // Only this machine: the preview reads files from it and starts packages from paths on it.
    server: { host: "127.0.0.1", port: 5175, strictPort: true },
  };
});
