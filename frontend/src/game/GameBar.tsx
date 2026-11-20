// The bar over the top of the game (GAME-14, UX mock `game`): the event's name and "Webseite", which leaves the game, as translucent rounded pills. There
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
  // Two translucent pills over the world: the event's name at the top left, "Webseite" at the top right.
  return (
    <header className="game-bar">
      <b className="game-bar-name">
        <span>{name ?? t("app.name")}</span>
      </b>
      <Link className="game-bar-web" to="/" onClick={markWebsiteVisit}>
        <SiteIcon path={SITE_ICON_PATHS.home} />
        {t("nav.site")}
      </Link>
    </header>
  );
}
