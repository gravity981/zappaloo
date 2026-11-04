import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./app/routes.tsx";
import { initI18n } from "./i18n/i18n.ts";
import "./app/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing in index.html");

await initI18n();
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(routes)} />
  </StrictMode>,
);
