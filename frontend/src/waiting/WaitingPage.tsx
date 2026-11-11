// The waiting page of a closed platform (ACS-10 – ACS-13; UX mock `waiting`): a full-screen
// door scene, the event name with Profil and Abmelden on top, and a card with the optional
// countdown, the text for the guest's RSVP status and the button to the RSVP.
import "./waiting.css";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { doorResponseSchema, waitingPageSchema } from "@zappaloo/shared";
import { useAdminData, useErrorText } from "../admin/data.ts";
import { useSession } from "../app/session.ts";
import Countdown from "./Countdown.tsx";
import DoorScene from "./DoorScene.tsx";

export default function WaitingPage() {
  const { t } = useTranslation();
  const session = useSession();
  const errorText = useErrorText();
  const { data: page, failed } = useAdminData("/api/waiting", waitingPageSchema);
  const { data: door } = useAdminData("/api/waiting/door", doorResponseSchema);

  return (
    <div className="waiting">
      {door && <DoorScene door={door} />}
      <header className="waiting-top">
        <b>{page?.eventName ?? ""}</b>
        <span className="waiting-menu">
          <Link to="/profile">{t("nav.profile")}</Link>
          <button type="button" onClick={() => void session.logout()}>
            {t("nav.logout")}
          </button>
        </span>
      </header>
      <section className="waiting-card" aria-live="polite">
        {failed && (
          <p role="alert" className="error">
            {errorText(failed)}
          </p>
        )}
        {page && (
          <>
            {page.countdownTo && <Countdown to={page.countdownTo} />}
            <p>{page.text}</p>
            {page.rsvp && (
              <Link className="waiting-button" to="/rsvp">
                {page.status === "none" ? t("waiting.answer") : t("waiting.change")}
              </Link>
            )}
          </>
        )}
        <Link className="waiting-privacy" to="/datenschutz">
          {t("footer.privacy")}
        </Link>
      </section>
    </div>
  );
}
