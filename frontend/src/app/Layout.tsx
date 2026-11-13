// The website frame (sw-architecture.md 5.6, WEB-04; UX mock `site`): the event's name in the
// header, and one navigation with Start and Mehr. On a phone that navigation is the bottom tab bar;
// on a wide screen it sits in the header, with "Spielwelt" and the profile. While the platform is
// closed a guest sees only the waiting page and the way back to it (ACS-10).
import "./ui.css";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import { useSiteName } from "../guest/site.ts";
import { useFeature } from "./event.ts";
import { useRestricted } from "./restricted.ts";
import { useSession } from "./session.ts";
import VersionFooter from "./VersionFooter.tsx";
import { SiteIcon } from "./siteIcons.tsx";
import { SITE_ICON_PATHS } from "./siteIconPaths.ts";

/** The initials of a name, for the avatar in the header ("Erika Huber" → "EH"). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .filter((letter) => letter !== "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Layout() {
  const { t } = useTranslation();
  const restricted = useRestricted();
  const session = useSession();
  const rsvp = useFeature("rsvp");
  const { pathname } = useLocation();
  const name = useSiteName();
  // The waiting page is a full-screen scene of its own.
  if (restricted && pathname === "/") return <Outlet />;
  const vip = session.user?.roles.includes("vip") ?? false;
  return (
    <div className="guest guest-site">
      <header className="guest-site-head">
        <b>{name ?? t("app.name")}</b>
        <nav className="site-nav" aria-label={t("nav.site")}>
          {restricted ? (
            <>
              <NavLink to="/" end>
                {t("nav.waiting")}
              </NavLink>
              {rsvp && vip && <NavLink to="/rsvp">{t("nav.rsvp")}</NavLink>}
              {session.user && <NavLink to="/profile">{t("nav.profile")}</NavLink>}
            </>
          ) : (
            <>
              <NavLink to="/" end>
                <SiteIcon path={SITE_ICON_PATHS.home} />
                <span>{t("nav.home")}</span>
              </NavLink>
              <NavLink to="/mehr">
                <SiteIcon path={SITE_ICON_PATHS.menu} />
                <span>{t("nav.more")}</span>
              </NavLink>
            </>
          )}
        </nav>
        {!restricted && (
          <div className="site-head-r">
            <NavLink className="btn sm" to="/game">
              <SiteIcon path={SITE_ICON_PATHS.play} />
              {t("nav.game")}
            </NavLink>
            {session.user && (
              <NavLink className="site-avatar" to="/profile" aria-label={t("nav.profile")}>
                {initials(session.user.displayName)}
              </NavLink>
            )}
          </div>
        )}
      </header>
      <main className="guest-site-main">
        <Outlet />
        <VersionFooter />
      </main>
    </div>
  );
}
