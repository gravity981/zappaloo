// The start page before the event day (sw-architecture.md 5.6, WEB-10, WEB-11; UX mock `home`,
// variant "Before the event"): the hero image (uncropped, with its alt text), the welcome text, the
// countdown card, the RSVP card and the shortcuts to the pages under "Mehr". The event-day layout
// comes with step 4d. While the platform is closed a guest lands on the waiting page (ACS-10).
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  contentResponseSchema,
  rsvpStateSchema,
  rsvpStatus,
  websiteResponseSchema,
} from "@zappaloo/shared";
import type { Countdown, RsvpState } from "@zappaloo/shared";
import Markdown from "../app/Markdown.tsx";
import { useFeature } from "../app/event.ts";
import { useApiData } from "../app/useApi.ts";
import { useRestricted } from "../app/restricted.ts";
import { useSession } from "../app/session.ts";
import WaitingPage from "../waiting/WaitingPage.tsx";

/** The countdown card (WEB-11): the days, and the date and place of the first program item. */
function CountdownCard({ countdown }: { countdown: Countdown }) {
  const { t, i18n } = useTranslation();
  // The day is a calendar day of the event; noon in UTC shows it on the same day everywhere.
  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${countdown.date}T12:00:00Z`));
  return (
    <section className="card strong" aria-labelledby="countdown-title">
      <span className="eyebrow" id="countdown-title">
        {t("website.countdownTitle")}
      </span>
      <b className="countdown-days">{t("website.countdownDays", { count: countdown.days })}</b>
      <span className="hint">
        {day}
        {countdown.placeName ? ` · ${countdown.placeName}` : ""}
      </span>
    </section>
  );
}

/** The RSVP card: the guest's status and the program items they attend (RSVP-01). */
function RsvpCard({ state }: { state: RsvpState }) {
  const { t } = useTranslation();
  const answer = state.answer;
  const attendingIds = answer?.attendingItemIds ?? [];
  const status = rsvpStatus(
    answer !== null,
    state.programItems.map((item) => item.id),
    attendingIds,
    answer?.declinedItemIds ?? [],
  );
  const names = state.programItems
    .filter((item) => attendingIds.includes(item.id))
    .map((item) => item.name)
    .join(", ");
  return (
    <section className="card">
      <div className="row">
        <b className="grow">{t("website.rsvpTitle")}</b>
        <span className="tag">{t(`website.rsvpStatus.${status}`)}</span>
      </div>
      {names !== "" && <span className="hint">{names}</span>}
      <Link to="/rsvp">{t("website.rsvpOpen")}</Link>
    </section>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const restricted = useRestricted();
  const session = useSession();
  const rsvpOn = useFeature("rsvp") && (session.user?.roles.includes("vip") ?? false);
  const content = useApiData(restricted ? undefined : "/api/content", contentResponseSchema);
  const website = useApiData(restricted ? undefined : "/api/website", websiteResponseSchema);
  const rsvp = useApiData(restricted || !rsvpOn ? undefined : "/api/rsvp", rsvpStateSchema);
  // While the platform is closed, guests land on the waiting page (ACS-10).
  if (restricted) return <WaitingPage />;
  if (!content) return null;

  const shortcuts = content.pages.filter((page) => page.inMore);
  const hero = content.start.heroImageId;
  return (
    <section className="start">
      <div className="start-main">
        {hero !== null && (
          <img
            className="hero"
            src={`/api/content/images/${String(hero)}`}
            alt={content.start.heroAlt ?? ""}
          />
        )}
        {content.startMarkdown.trim() !== "" && <Markdown text={content.startMarkdown} />}
      </div>
      <div className="start-side">
        {website?.countdown && <CountdownCard countdown={website.countdown} />}
        {rsvp && <RsvpCard state={rsvp} />}
        {shortcuts.length > 0 && (
          <nav className="shortcuts" aria-label={t("website.shortcuts")}>
            {shortcuts.map((page) => (
              <Link key={page.id} className="btn soft" to={`/p/${page.slug}`}>
                {page.title}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
