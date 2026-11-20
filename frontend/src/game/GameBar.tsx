// The bar over the top of the game (GAME-14, UX mock `game`): the event's name and "Webseite", which leaves the game, as translucent rounded pills. There
// are no further buttons on top of the game: the programme, the RSVP and the upload are reached through the objects
// of the world (GAME-16).
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { markWebsiteVisit } from "../app/gameEntry.ts";
import { websiteResponseSchema } from "@zappaloo/shared";
import { useApiData } from "../app/useApi.ts";
import { useSiteName } from "../guest/site.ts";
import { useEventFormat } from "../rsvp/format.ts";
import { SITE_ICON_PATHS } from "../app/siteIconPaths.ts";
import { SiteIcon } from "../app/siteIcons.tsx";

export default function GameBar() {
  const { t } = useTranslation();
  const name = useSiteName();
  const format = useEventFormat();
  const website = useApiData("/api/website", websiteResponseSchema);
  // Two translucent pills over the world: the event's name with its date under it at the top left, "Webseite" at the top right.
  return (
    <header className="game-bar">
      <div className="game-bar-name">
        <b>
          <span>{name ?? t("app.name")}</span>
        </b>
        {website?.eventDate && <small>{format.dayShort(website.eventDate)}</small>}
      </div>
      <Link className="game-bar-web" to="/" onClick={markWebsiteVisit}>
        <SiteIcon path={SITE_ICON_PATHS.home} />
        {t("nav.site")}
      </Link>
    </header>
  );
}
