import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { EventProvider } from "./EventProvider.tsx";
import { SessionProvider } from "./SessionProvider.tsx";
import { useSession } from "./session.ts";
import VersionFooter from "./VersionFooter.tsx";

function AccountNav() {
  const { t } = useTranslation();
  const session = useSession();
  if (!session.ready) return null;
  if (!session.user) return <NavLink to="/login">{t("nav.login")}</NavLink>;
  return (
    <>
      <NavLink to="/profile">{t("nav.profile")}</NavLink>
      <button type="button" onClick={() => void session.logout()}>
        {t("nav.logout")}
      </button>
    </>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  return (
    <EventProvider>
      <SessionProvider>
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
      </SessionProvider>
    </EventProvider>
  );
}
