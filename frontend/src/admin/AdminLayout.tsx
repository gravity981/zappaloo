// The shell of the admin area (sw-architecture.md 8.3, ROLE-07): header with the platform state
// and the way back to the website, navigation with the pages that exist. Only admins get in;
// the server refuses everyone else's calls anyway. Until the event is set up (CFG-02) the area
// shows only the setup form.
import "./admin.css";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { useEvent } from "../app/event.ts";
import { useSession } from "../app/session.ts";
import VersionFooter from "../app/VersionFooter.tsx";
import AdminSetupPage from "./AdminSetupPage.tsx";

/** Later steps add their pages here (Rückmeldungen, Sitzplan, Inhalte, Spielwelt, Moderation). */
const PAGES = [
  { to: "/admin", label: "admin.nav.home", end: true },
  { to: "/admin/invitations", label: "admin.nav.invitations", end: false },
  { to: "/admin/rsvp", label: "admin.nav.rsvp", end: false },
  { to: "/admin/users", label: "admin.nav.users", end: false },
  { to: "/admin/settings", label: "admin.nav.settings", end: false },
] as const;

export default function AdminLayout() {
  const { t } = useTranslation();
  const session = useSession();
  const event = useEvent();
  if (!session.ready) return null;
  if (!session.user?.roles.includes("admin")) return <Navigate to="/" replace />;
  if (event && !event.setupComplete) {
    return (
      <div className="admin setup">
        <header className="admin-head no-print">
          <strong>{t("admin.title")}</strong>
          <span className="tag">{t("admin.notSetUp")}</span>
          <button type="button" className="link" onClick={() => void session.logout()}>
            {t("nav.logout")}
          </button>
        </header>
        <main className="admin-main">
          <AdminSetupPage />
          <VersionFooter />
        </main>
      </div>
    );
  }
  return (
    <div className="admin">
      <header className="admin-head no-print">
        <strong>{t("admin.title")}</strong>
        {event && (
          <span className="tag">
            {event.settings.platformOpen ? t("admin.platformOpen") : t("admin.platformClosed")}
          </span>
        )}
        <Link to="/">{t("admin.toWebsite")}</Link>
      </header>
      <nav className="admin-nav no-print" aria-label={t("admin.title")}>
        {PAGES.map((page) => (
          <NavLink key={page.to} to={page.to} end={page.end}>
            {t(page.label)}
          </NavLink>
        ))}
      </nav>
      <main className="admin-main">
        <Outlet />
        <VersionFooter />
      </main>
    </div>
  );
}
