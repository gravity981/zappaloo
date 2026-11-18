import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "../../frontend/src/app/ui.css";
import "./editor.css";

const root = document.getElementById("root");
if (root === null) throw new Error("The editor root element is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
