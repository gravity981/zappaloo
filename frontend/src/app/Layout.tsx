// The shell of the signed-in pages (UX mock `site`, reduced to Release 1): the event's name with
// the account links. While the platform is closed a guest has no website navigation, only the
// way back to the waiting page (ACS-10). The waiting page itself is a full-screen scene.
import "./ui.css";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import { useSiteName } from "../guest/site.ts";
import { useFeature } from "./event.ts";
import { useRestricted } from "./restricted.ts";
import { useSession } from "./session.ts";
import VersionFooter from "./VersionFooter.tsx";

function AccountNav() {
  const { t } = useTranslation();
  const session = useSession();
  const rsvp = useFeature("rsvp");
  if (!session.ready) return null;
  if (!session.user) return <NavLink to="/login">{t("nav.login")}</NavLink>;
  return (
    <>
      {rsvp && session.user.roles.includes("vip") && <NavLink to="/rsvp">{t("nav.rsvp")}</NavLink>}
      {session.user.roles.includes("admin") && <NavLink to="/admin">{t("nav.admin")}</NavLink>}
      <NavLink to="/profile">{t("nav.profile")}</NavLink>
      <button type="button" onClick={() => void session.logout()}>
        {t("nav.logout")}
      </button>
    </>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const restricted = useRestricted();
  const { pathname } = useLocation();
  const name = useSiteName();
  // The waiting page is a full-screen scene of its own.
  if (restricted && pathname === "/") return <Outlet />;
  return (
    <div className="guest guest-site">
      <header className="guest-site-head">
        <b>{name ?? t("app.name")}</b>
        <nav>
          {restricted ? (
            <NavLink to="/" end>
              {t("nav.waiting")}
            </NavLink>
          ) : (
            <>
              <NavLink to="/">{t("nav.home")}</NavLink>
              <NavLink to="/game">{t("nav.game")}</NavLink>
            </>
          )}
          <AccountNav />
        </nav>
      </header>
      <main className="guest-site-main">
        <Outlet />
        <VersionFooter />
      </main>
    </div>
  );
}
