// "Programm" (sw-architecture.md 5.5, WEB-07, WEB-09; UX mock `programme`): the activities of the
// program items the guest is invited to (WEB-12), as one timeline per day. While the event is under way the activities that are over are greyed out and the current one
// is marked. "Hingehen" comes with step 5d.
import { useTranslation } from "react-i18next";
import { programmeResponseSchema } from "@zappaloo/shared";
import { useApiData } from "../app/useApi.ts";
import { useEventFormat } from "../rsvp/format.ts";

export default function ProgrammePage() {
  const { t } = useTranslation();
  const format = useEventFormat();
  const programme = useApiData("/api/programme", programmeResponseSchema);
  if (!programme) return null;
  // One timeline per calendar day, under the day's name: the rows show only the time of day.
  const days = [...Map.groupBy(programme.items, (item) => item.day)];
  return (
    <section className="programme">
      <h1 className="h1">{t("nav.programme")}</h1>
      {programme.items.length === 0 ? (
        <p>{t("website.noProgramme")}</p>
      ) : (
        days.map(([day, items]) => (
          <div key={day} className="stack">
            <h2 className="eyebrow">{format.dayWithWeekday(day)}</h2>
            <ol className="timeline">
              {items.map((item) => (
                <li key={item.id} className={`tl ${item.status}`}>
                  <span className="tl-time">{format.time(item.startsAt)}</span>
                  <span className="tl-rail" aria-hidden="true" />
                  <div className="tl-card">
                    <div className="row">
                      <b>{item.name}</b>
                      {item.status === "now" && <span className="tag">{t("website.now")}</span>}
                    </div>
                    {item.placeName !== null && <span className="hint">{item.placeName}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}
