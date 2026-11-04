import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import VersionFooter from "./VersionFooter.tsx";

export default function Layout() {
  const { t } = useTranslation();
  return (
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
  );
}
