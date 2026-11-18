// Shows content the way a guest sees it: with the event's theme (sw-architecture.md 19.7). The admin
// area itself keeps the platform's neutral look, but a preview of guest content is the guest's view,
// so it carries the theme's colours and font faces like `ThemeScope` does for the website.
import type { ReactNode } from "react";
import { useSite } from "../guest/site.ts";
import { fontFaceRules, themeStyle } from "./themeStyle.ts";

export function ThemedPreview({ children }: { children: ReactNode }) {
  const theme = useSite()?.theme ?? null;
  return (
    <div className="themed" style={themeStyle(theme)}>
      {theme !== null && <style>{fontFaceRules(theme)}</style>}
      <div className="guest themed-preview">{children}</div>
    </div>
  );
}
