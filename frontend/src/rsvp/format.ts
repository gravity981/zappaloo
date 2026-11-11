// Dates and times of an event are shown in its time zone, in the page's language.
import { useTranslation } from "react-i18next";
import { useEvent } from "../app/event.ts";

export function useEventFormat() {
  const { i18n } = useTranslation();
  const timeZone = useEvent()?.timezone ?? "UTC";
  return {
    timeZone,
    /** `14:00` */
    time: (instant: string) =>
      new Date(instant).toLocaleTimeString(i18n.language, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
      }),
    /** `12.6.2027` */
    date: (instant: string) =>
      new Date(instant).toLocaleDateString(i18n.language, {
        timeZone,
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }),
    /** `1. Mai 2027`, for a calendar day (`YYYY-MM-DD`) such as the RSVP deadline. */
    day: (date: string) =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString(i18n.language, {
        timeZone: "UTC",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
  };
}
