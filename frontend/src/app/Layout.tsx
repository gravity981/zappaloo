import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { EventProvider } from "./EventProvider.tsx";
import VersionFooter from "./VersionFooter.tsx";

export default function Layout() {
  const { t } = useTranslation();
  return (
    <EventProvider>
      <div className="layout">
        <header>
          <strong>{t("app.name")}</strong>
          <nav>
            <NavLink to="/">{t("nav.home")}</NavLink>
            <NavLink to="/game">{t("nav.game")}</NavLink>
          </nav>
        </header>
        <main>
          <Outlet />
        </main>
        <VersionFooter />
      </div>
    </EventProvider>
  );
}
