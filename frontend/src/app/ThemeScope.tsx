// The event's theme for the website and the guest pages (sw-architecture.md 19.7, THM-06): the
// colours and font faces that `GET /api/site` carries are set on a wrapper around these pages. The
// admin area sits outside the wrapper and keeps the platform's neutral look. Without a theme the
// wrapper sets nothing, and the defaults of ui.css apply.
import { Outlet } from "react-router";
import "./ui.css";
import { useSite } from "../guest/site.ts";
import { fontFaceRules, themeStyle } from "./themeStyle.ts";

/** The wrapper of the website and the guest pages: the theme, then the page. */
export function ThemeScope() {
  const theme = useSite()?.theme ?? null;
  return (
    <div className="themed" style={themeStyle(theme)}>
      {theme !== null && <style>{fontFaceRules(theme)}</style>}
      <Outlet />
    </div>
  );
}
