import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  if (command !== "serve") {
    throw new Error("The theme editor is a development server and cannot be built for production");
  }
  if (process.env.APP_ENV !== "dev") {
    throw new Error("Run the theme editor only in the development environment (APP_ENV=dev)");
  }
  return {
    plugins: [react()],
    // Only this machine: later stories read and write theme packages through this server.
    server: { host: "127.0.0.1", port: 5176, strictPort: true, allowedHosts: [] },
  };
});
