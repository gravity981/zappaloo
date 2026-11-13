// The start page (sw-architecture.md 5.6, WEB-10, WEB-11; UX mock `home`). Before the event day: the
// hero image (uncropped, with its alt text), the welcome text, the countdown card, the RSVP card and
// the shortcuts. On the event day: "now" and "next" on top, then the shortcuts (WEB-07). The shortcuts
// lead to "Programm" and to the pages under "Mehr". While the platform is closed a guest lands on the
// waiting page (ACS-10).
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  contentResponseSchema,
  rsvpStateSchema,
  rsvpStatus,
  websiteResponseSchema,
} from "@zappaloo/shared";
import type { Countdown, RsvpState, ScheduleEntryView } from "@zappaloo/shared";
import Markdown from "../app/Markdown.tsx";
import { useFeature } from "../app/event.ts";
import { useApiData } from "../app/useApi.ts";
import { useRestricted } from "../app/restricted.ts";
import { useSession } from "../app/session.ts";
import { useEventFormat } from "../rsvp/format.ts";
import WaitingPage from "../waiting/WaitingPage.tsx";

/** The countdown card (WEB-11): the days, and the date and place of the first program item. */
function CountdownCard({ countdown }: { countdown: Countdown }) {
  const { t } = useTranslation();
  const format = useEventFormat();
  return (
    <section className="card strong" aria-labelledby="countdown-title">
      <span className="eyebrow" id="countdown-title">
        {t("website.countdownTitle")}
      </span>
      <b className="countdown-days">{t("website.countdownDays", { count: countdown.days })}</b>
      <span className="hint">
        {format.dayShort(countdown.date)}
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

/** "now" or "next" on the event day: the entry, its time and its place. */
function NowNextCard({
  label,
  entry,
  current,
}: {
  label: string;
  entry: ScheduleEntryView;
  current: boolean;
}) {
  const { t } = useTranslation();
  const format = useEventFormat();
  const time =
    entry.endsAt !== null
      ? `${format.time(entry.startsAt)}–${format.time(entry.endsAt)}`
      : current
        ? t("website.since", { time: format.time(entry.startsAt) })
        : format.time(entry.startsAt);
  return (
    <section className="card">
      <span className="eyebrow">{label}</span>
      <b>{entry.name}</b>
      <span className="hint">
        {time}
        {entry.placeName ? ` · ${entry.placeName}` : ""}
      </span>
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

  const shortcuts = (
    <nav className="shortcuts" aria-label={t("website.shortcuts")}>
      <Link className="btn soft" to="/programme">
        {t("nav.programme")}
      </Link>
      {content.pages
        .filter((page) => page.inMore)
        .map((page) => (
          <Link key={page.id} className="btn soft" to={`/p/${page.slug}`}>
            {page.title}
          </Link>
        ))}
    </nav>
  );

  if (website?.eventDay) {
    return (
      <section className="start">
        <div className="start-main">
          {website.now !== null && (
            <NowNextCard label={t("website.now")} entry={website.now} current />
          )}
          {website.next !== null && (
            <NowNextCard label={t("website.next")} entry={website.next} current={false} />
          )}
        </div>
        <div className="start-side">{shortcuts}</div>
      </section>
    );
  }

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
        {shortcuts}
      </div>
    </section>
  );
}
