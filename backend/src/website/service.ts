// What the website computes from the schedule (WEB-07, WEB-09, WEB-10; sw-architecture.md 5.5,
// 5.6): the countdown and the event day for the start page, "now" and "next" on the event day, and
// the programme of a guest with the status of each entry.
import { asc, eq } from "drizzle-orm";
import type { ProgrammeResponse, ScheduleEntryView, WebsiteResponse } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { activities, contentPlaces, contentStart } from "../database/schema.ts";
import type { EventService } from "../event/service.ts";
import type { RsvpService } from "../rsvp/service.ts";
import { calendarDay, countdownAt } from "./countdown.ts";
import { isEventDay, isEventUnderWay, nowNextAt, statusAt } from "./schedule.ts";
import type { ScheduleEntry } from "./schedule.ts";

export class WebsiteService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #rsvp: RsvpService;

  constructor(database: Database, event: EventService, rsvp: RsvpService) {
    this.#database = database;
    this.#event = event;
    this.#rsvp = rsvp;
  }

  /** All activities of the event by start, with the names of their places (WEB-12). */
  #entries(): ScheduleEntry[] {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const names = new Map(
      db
        .select({ id: contentPlaces.id, name: contentPlaces.name })
        .from(contentPlaces)
        .where(eq(contentPlaces.eventId, eventId))
        .all()
        .map((row) => [row.id, row.name] as const),
    );
    return db
      .select()
      .from(activities)
      .where(eq(activities.eventId, eventId))
      .orderBy(asc(activities.startsAt), asc(activities.id))
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        programItemId: row.programItemId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        placeName: row.placeId === null ? null : (names.get(row.placeId) ?? null),
      }));
  }

  /**
   * `GET /api/website`: the countdown, the event day, and "now" and "next" on the event day. The
   * countdown and the event day are the same for every guest (WEB-11); "now" and "next" are the
   * activities of the guest's program items, shown only to a guest who accepted (WEB-07, WEB-12).
   */
  website(userId: number, now: Date = new Date()): WebsiteResponse {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const timeZone = this.#event.get().timezone;
    const entries = this.#entries();
    const first = entries[0];
    if (timeZone === null) {
      return { countdown: null, eventDay: false, eventDate: null, now: null, next: null };
    }
    const settings = db
      .select({ countdown: contentStart.countdown })
      .from(contentStart)
      .where(eq(contentStart.eventId, eventId))
      .get();
    const eventDay = isEventDay(entries, now, timeZone);
    const accepted = this.#rsvp.guestStatus(userId) === "attending";
    // "Now / next" come from the activities of the guest's own program items (7.4.3).
    const invited = new Set(this.#rsvp.invitedProgramItemIds(userId));
    const mine = entries.filter((entry) => invited.has(entry.programItemId));
    const nowNext =
      eventDay && accepted ? nowNextAt(mine, now, timeZone) : { now: null, next: null };
    return {
      countdown: countdownAt({
        first: first && { startsAt: first.startsAt, placeName: first.placeName },
        enabled: settings?.countdown ?? true,
        now,
        timeZone,
      }),
      eventDay,
      eventDate: first ? calendarDay(first.startsAt, timeZone) : null,
      now: nowNext.now && view(nowNext.now),
      next: nowNext.next && view(nowNext.next),
    };
  }

  /** `GET /api/programme`: the activities of the program items the guest is invited to, with their status. */
  programme(userId: number, now: Date = new Date()): ProgrammeResponse {
    const timeZone = this.#event.get().timezone;
    const entries = this.#entries();
    const invited = new Set(this.#rsvp.invitedProgramItemIds(userId));
    const eventDay = timeZone !== null && isEventDay(entries, now, timeZone);
    // Past and current activities are marked while the event is under way, on every day of it.
    const underWay = timeZone !== null && isEventUnderWay(entries, now, timeZone);
    // Only a guest who accepted is told which entry is now (WEB-07); the others see past and upcoming.
    const accepted = this.#rsvp.guestStatus(userId) === "attending";
    const visible = entries.filter((entry) => invited.has(entry.programItemId));
    const current = eventDay && accepted ? nowNextAt(visible, now, timeZone).now : null;
    return {
      eventDay,
      eventDate:
        timeZone !== null && entries[0] ? calendarDay(entries[0].startsAt, timeZone) : null,
      items: visible.map((entry) => ({
        ...view(entry),
        status: underWay ? statusAt(entry, current, now) : "upcoming",
        day: timeZone === null ? "" : calendarDay(entry.startsAt, timeZone),
      })),
    };
  }
}

function view(entry: ScheduleEntry): ScheduleEntryView {
  return {
    id: entry.id,
    name: entry.name,
    programItemId: entry.programItemId,
    startsAt: entry.startsAt.toISOString(),
    endsAt: entry.endsAt?.toISOString() ?? null,
    placeName: entry.placeName,
  };
}
