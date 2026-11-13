// The shell of the admin area (sw-architecture.md 8.3, ROLE-07): header with the platform state
// and the way back to the website, navigation with the pages that exist. Admins get in; staff with
// `editWebsiteContent` get in too, and see only "Inhalte" (ROLE-06). The server refuses everyone
// else's calls anyway. Until the event is set up (CFG-02) the area shows only the setup form.
import "../app/ui.css";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { useEvent } from "../app/event.ts";
import { useSession } from "../app/session.ts";
import VersionFooter from "../app/VersionFooter.tsx";
import { usePendingRequests } from "./pending.ts";
import AdminSetupPage from "./AdminSetupPage.tsx";

/** The number of companion requests waiting for a decision, next to "Rückmeldungen" (RSVP-09). */
function PendingBadge() {
  const { t } = useTranslation();
  const count = usePendingRequests();
  if (!count) return null;
  return (
    <span className="badge" role="img" aria-label={t("admin.nav.rsvpBadge", { count })}>
      {count}
    </span>
  );
}

/** Later steps add their pages here (Rückmeldungen, Sitzplan, Spielwelt, Moderation). */
const PAGES = [
  { to: "/admin", label: "admin.nav.home", end: true },
  { to: "/admin/invitations", label: "admin.nav.invitations", end: false },
  { to: "/admin/rsvp", label: "admin.nav.rsvp", end: false },
  { to: "/admin/users", label: "admin.nav.users", end: false },
  { to: "/admin/content", label: "admin.nav.content", end: false },
  { to: "/admin/settings", label: "admin.nav.settings", end: false },
] as const;

/** The pages staff with `editWebsiteContent` may use; the rest is for admins (ROLE-06, ROLE-07). */
const STAFF_PAGES: readonly string[] = ["/admin/content"];

export default function AdminLayout() {
  const { t } = useTranslation();
  const session = useSession();
  const event = useEvent();
  const location = useLocation();
  if (!session.ready) return null;
  const roles = session.user?.roles ?? [];
  const admin = roles.includes("admin");
  const staffEditor =
    roles.includes("staff") && (session.user?.capabilities ?? []).includes("editWebsiteContent");
  if (!admin && !staffEditor) return <Navigate to="/" replace />;
  // A staff member gets only the content editor; every other address leads there.
  if (!admin && !location.pathname.startsWith("/admin/content")) {
    return <Navigate to="/admin/content" replace />;
  }
  if (admin && event && !event.setupComplete) {
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
        {PAGES.filter((page) => admin || STAFF_PAGES.includes(page.to)).map((page) => (
          <NavLink key={page.to} to={page.to} end={page.end}>
            {t(page.label)}
            {page.to === "/admin/rsvp" && event?.features.rsvp && <PendingBadge />}
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
