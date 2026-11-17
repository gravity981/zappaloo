// The bar at the top of the game (GAME-14, UX mock `game`): Programm, Rückmeldung (with a badge while the RSVP is
// open) and Website, which leaves the game. There are no further buttons on top of the game; "Hochladen" comes with
// the upload in stage 7.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { markWebsiteVisit } from "../app/gameEntry.ts";

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
  return (
    <nav className="game-bar" aria-label={t("game.bar.label")}>
      <button
        type="button"
        className="btn soft sm"
        onClick={() => {
          onOpen("programme", t("nav.programme"));
        }}
      >
        {t("nav.programme")}
      </button>
      {rsvp && (
        <button
          type="button"
          className="btn soft sm"
          onClick={() => {
            onOpen("rsvp", t("nav.rsvp"));
          }}
        >
          {t("nav.rsvp")}
          {rsvpOpen && (
            <span className="game-badge" role="status" aria-label={t("game.bar.rsvpOpen")} />
          )}
        </button>
      )}
      <Link className="btn soft sm game-bar-end" to="/" onClick={markWebsiteVisit}>
        {t("nav.site")}
      </Link>
    </nav>
  );
}
