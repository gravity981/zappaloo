// The event of this installation: creating it from its bootstrap directory,
// reading and changing its feature toggles and settings, and the audit log
// (CFG-03, CFG-05, DATA-02, DATA-03; sw-architecture.md 19.3.1).
//
// Features and settings are read from the database on every call (never
// cached), so a change made by the CLI applies at once in a running server.
import { and, desc, eq } from "drizzle-orm";
import { FEATURE_NAMES, SETTING_NAMES } from "@zappaloo/shared";
import type {
  EventConfig,
  EventResponse,
  FeatureName,
  Features,
  SettingName,
  Settings,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { auditLog, eventFeatures, events, eventSettings } from "../database/schema.ts";

export class EventError extends Error {
  override name = "EventError";
}

/** Who did something: "cli", later "user:<id>". */
export type Actor = string;
export const CLI_ACTOR: Actor = "cli";

export function isFeatureName(name: string): name is FeatureName {
  return (FEATURE_NAMES as readonly string[]).includes(name);
}
export function isSettingName(name: string): name is SettingName {
  return (SETTING_NAMES as readonly string[]).includes(name);
}

/**
 * Creates the event on the first start, or refreshes its identity (name, time
 * zone, default language) on later starts. Features and settings only fill in
 * keys that are missing, so values changed at runtime are never overwritten.
 * An installation serves one event: a database with another event is refused.
 */
export function bootstrapEvent(
  database: Database,
  config: EventConfig,
  now: () => Date = () => new Date(),
): void {
  database.db.transaction((tx) => {
    const existing = tx.select({ id: events.id }).from(events).all();
    const other = existing.find((row) => row.id !== config.id);
    if (other) {
      throw new EventError(
        `the database belongs to the event "${other.id}", but EVENT_SLUG selects "${config.id}"; an installation serves exactly one event`,
      );
    }
    const time = now();
    tx.insert(events)
      .values({
        id: config.id,
        slug: config.slug,
        name: config.name,
        timezone: config.timezone,
        defaultLanguage: config.defaultLanguage,
        createdAt: time,
        updatedAt: time,
      })
      .onConflictDoUpdate({
        target: events.id,
        set: {
          slug: config.slug,
          name: config.name,
          timezone: config.timezone,
          defaultLanguage: config.defaultLanguage,
          updatedAt: time,
        },
      })
      .run();
    for (const name of FEATURE_NAMES) {
      tx.insert(eventFeatures)
        .values({ eventId: config.id, name, enabled: config.features[name] })
        .onConflictDoNothing()
        .run();
    }
    for (const name of SETTING_NAMES) {
      tx.insert(eventSettings)
        .values({ eventId: config.id, name, value: config.settings[name] })
        .onConflictDoNothing()
        .run();
    }
  });
}

export interface AuditEntry {
  id: number;
  eventId: string;
  actor: Actor;
  action: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export class EventService {
  readonly eventId: string;
  readonly #database: Database;
  readonly #now: () => Date;

  constructor(database: Database, eventId: string, now: () => Date = () => new Date()) {
    this.#database = database;
    this.eventId = eventId;
    this.#now = now;
  }

  /** The service of the installation's event; the application must have started once. */
  static forInstallation(database: Database, now?: () => Date): EventService {
    const rows = database.db.select({ id: events.id }).from(events).all();
    const [only] = rows;
    if (!only || rows.length !== 1) {
      throw new EventError(
        rows.length === 0
          ? "the database has no event yet; start the application once to create it from its event.json"
          : "the database holds more than one event; an installation serves exactly one",
      );
    }
    return new EventService(database, only.id, now);
  }

  get(): EventResponse {
    const { db } = this.#database;
    const event = db.select().from(events).where(eq(events.id, this.eventId)).get();
    if (!event) throw new EventError(`event "${this.eventId}" not found`);
    return {
      id: event.id,
      name: event.name,
      slug: event.slug,
      timezone: event.timezone,
      defaultLanguage: event.defaultLanguage,
      features: this.features(),
      settings: this.settings(),
    };
  }

  features(): Features {
    const rows = this.#database.db
      .select()
      .from(eventFeatures)
      .where(eq(eventFeatures.eventId, this.eventId))
      .all();
    const flags = Object.fromEntries(rows.map((row) => [row.name, row.enabled]));
    return Object.fromEntries(
      FEATURE_NAMES.map((name) => [name, flags[name] ?? false]),
    ) as Features;
  }

  settings(): Settings {
    const rows = this.#database.db
      .select()
      .from(eventSettings)
      .where(eq(eventSettings.eventId, this.eventId))
      .all();
    const flags = Object.fromEntries(rows.map((row) => [row.name, row.value]));
    return Object.fromEntries(
      SETTING_NAMES.map((name) => [name, flags[name] ?? false]),
    ) as Settings;
  }

  isFeatureEnabled(name: FeatureName): boolean {
    return this.features()[name];
  }

  /** Switches a feature; returns false (and logs nothing) if it already had that value. */
  setFeature(name: FeatureName, enabled: boolean, actor: Actor): boolean {
    return this.#database.db.transaction((tx) => {
      const current = this.features()[name];
      if (current === enabled) return false;
      tx.update(eventFeatures)
        .set({ enabled })
        .where(and(eq(eventFeatures.eventId, this.eventId), eq(eventFeatures.name, name)))
        .run();
      this.audit(actor, "feature.set", { name, from: current, to: enabled }, tx);
      return true;
    });
  }

  /** Changes a setting; returns false (and logs nothing) if it already had that value. */
  setSetting(name: SettingName, value: boolean, actor: Actor): boolean {
    return this.#database.db.transaction((tx) => {
      const current = this.settings()[name];
      if (current === value) return false;
      tx.update(eventSettings)
        .set({ value })
        .where(and(eq(eventSettings.eventId, this.eventId), eq(eventSettings.name, name)))
        .run();
      this.audit(actor, "setting.set", { name, from: current, to: value }, tx);
      return true;
    });
  }

  /** Records an administrative action (DATA-03). */
  audit(
    actor: Actor,
    action: string,
    details: Record<string, unknown>,
    tx: Pick<Database["db"], "insert"> = this.#database.db,
  ): void {
    tx.insert(auditLog)
      .values({
        eventId: this.eventId,
        actor,
        action,
        details: JSON.stringify(details),
        createdAt: this.#now(),
      })
      .run();
  }

  /** The newest audit entries, newest first. */
  auditEntries(limit = 100): AuditEntry[] {
    return this.#database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.eventId, this.eventId))
      .orderBy(desc(auditLog.id))
      .limit(limit)
      .all()
      .map((row) => ({ ...row, details: JSON.parse(row.details) as Record<string, unknown> }));
  }
}
