// The bar at the top of the game (GAME-14, UX mock `game`): the event's name and "Website", which leaves the game. There
// are no further buttons on top of the game: the programme, the RSVP and the upload are reached through the objects
// of the world (GAME-16).
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { markWebsiteVisit } from "../app/gameEntry.ts";
import { useSiteName } from "../guest/site.ts";
import { SITE_ICON_PATHS } from "../app/siteIconPaths.ts";
import { SiteIcon } from "../app/siteIcons.tsx";

export default function GameBar() {
  const { t } = useTranslation();
  const name = useSiteName();
  // The header of the website (UX mock `site`): the event's name at the left, "Website" at the right end.
  return (
    <header className="guest-site-head game-bar">
      <div className="site-brand">
        <b>{name ?? t("app.name")}</b>
      </div>
      <div className="site-head-r">
        <Link className="btn sm" to="/" onClick={markWebsiteVisit}>
          <SiteIcon path={SITE_ICON_PATHS.home} />
          {t("nav.site")}
        </Link>
      </div>
    </header>
  );
}
