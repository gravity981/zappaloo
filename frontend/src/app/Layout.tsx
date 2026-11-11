import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { useSession } from "./session.ts";
import VersionFooter from "./VersionFooter.tsx";

function AccountNav() {
  const { t } = useTranslation();
  const session = useSession();
  if (!session.ready) return null;
  if (!session.user) return <NavLink to="/login">{t("nav.login")}</NavLink>;
  return (
    <>
      {session.user.roles.includes("admin") && <NavLink to="/admin">{t("nav.admin")}</NavLink>}
      <NavLink to="/profile">{t("nav.profile")}</NavLink>
      <button type="button" onClick={() => void session.logout()}>
        {t("nav.logout")}
      </button>
    </>
  );
}

/** The shell of the website pages. */
export default function Layout() {
  const { t } = useTranslation();
  return (
    <div className="layout">
      <header>
        <strong>{t("app.name")}</strong>
        <nav>
          <NavLink to="/">{t("nav.home")}</NavLink>
          <NavLink to="/game">{t("nav.game")}</NavLink>
          <AccountNav />
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <VersionFooter />
    </div>
  );
}
