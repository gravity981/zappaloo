// What the website computes for the start page (WEB-11): the countdown to the first program item.
import { and, asc, eq } from "drizzle-orm";
import type { WebsiteResponse } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { contentPlaces, contentStart, programItems } from "../database/schema.ts";
import type { EventService } from "../event/service.ts";
import { countdownAt } from "./countdown.ts";
import type { FirstItem } from "./countdown.ts";

export class WebsiteService {
  readonly #database: Database;
  readonly #event: EventService;

  constructor(database: Database, event: EventService) {
    this.#database = database;
    this.#event = event;
  }

  /** `GET /api/website`: the countdown card, or null (no card). */
  website(now: Date = new Date()): WebsiteResponse {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const timeZone = this.#event.get().timezone;
    const settings = db
      .select({ countdown: contentStart.countdown })
      .from(contentStart)
      .where(eq(contentStart.eventId, eventId))
      .get();
    const row = db
      .select({ startsAt: programItems.startsAt, placeId: programItems.placeId })
      .from(programItems)
      .where(eq(programItems.eventId, eventId))
      .orderBy(asc(programItems.startsAt), asc(programItems.id))
      .limit(1)
      .get();
    let first: FirstItem | undefined;
    if (row) {
      const place =
        row.placeId === null
          ? undefined
          : db
              .select({ name: contentPlaces.name })
              .from(contentPlaces)
              .where(and(eq(contentPlaces.eventId, eventId), eq(contentPlaces.id, row.placeId)))
              .get();
      first = { startsAt: row.startsAt, placeName: place?.name ?? null };
    }
    return {
      countdown:
        timeZone === null
          ? null
          : countdownAt({
              first,
              enabled: settings?.countdown ?? true,
              now,
              timeZone,
            }),
    };
  }
}
