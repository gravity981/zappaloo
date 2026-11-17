// The bar at the top of the game (GAME-14, UX mock `game`): Programm, Rückmeldung (with a badge while the RSVP is
// open) and Website, which leaves the game. There are no further buttons on top of the game; "Hochladen" comes with
// the upload in stage 7.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { markWebsiteVisit } from "../app/gameEntry.ts";
import { useSiteName } from "../guest/site.ts";
import { SITE_ICON_PATHS } from "../app/siteIconPaths.ts";
import { SiteIcon } from "../app/siteIcons.tsx";

export default function GameBar({
  rsvp,
  rsvpOpen,
  onOpen,
}: {
  /** The guest answers the RSVP: the button exists. */
  rsvp: boolean;
  /** The RSVP is not answered yet: the button shows a badge. */
  rsvpOpen: boolean;
  onOpen: (page: "programme" | "rsvp", label: string) => void;
}) {
  const { t } = useTranslation();
  const name = useSiteName();
  // The header of the website (UX mock `site`): the event's name, the buttons as its tabs, "Website" at the right end.
  return (
    <header className="guest-site-head game-bar">
      <div className="site-brand">
        <b>{name ?? t("app.name")}</b>
      </div>
      <nav aria-label={t("game.bar.label")}>
        <button
          type="button"
          onClick={() => {
            onOpen("programme", t("nav.programme"));
          }}
        >
          {t("nav.programme")}
        </button>
        {rsvp && (
          <>
            <button
              type="button"
              onClick={() => {
                onOpen("rsvp", t("nav.rsvp"));
              }}
            >
              {t("nav.rsvp")}
              {/* The dot is for the eye; the status for the screen reader stands outside the button's name. */}
              {rsvpOpen && <span className="game-badge" aria-hidden="true" />}
            </button>
            {rsvpOpen && (
              <span role="status" aria-label={t("game.bar.rsvpOpen")} className="visually-hidden">
                {t("game.bar.rsvpOpen")}
              </span>
            )}
          </>
        )}
      </nav>
      <div className="site-head-r">
        <Link className="btn sm" to="/" onClick={markWebsiteVisit}>
          <SiteIcon path={SITE_ICON_PATHS.home} />
          {t("nav.site")}
        </Link>
      </div>
    </header>
  );
}
