// The name of the page and of the home screen icon is the event's name (PWA-03): the browser
// tab shows it, and iOS takes it from the page when a guest adds the site to the home screen.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSiteName } from "../guest/site.ts";

export function AppTitle() {
  const { t } = useTranslation();
  const name = useSiteName() ?? t("app.name");
  useEffect(() => {
    document.title = name;
    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute("content", name);
  }, [name]);
  return null;
}
