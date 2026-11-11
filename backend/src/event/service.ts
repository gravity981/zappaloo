// The event of this installation: creating it on the first start, its setup, reading and
// changing its identity, feature toggles and settings, and the audit log
// (CFG-02, CFG-03, CFG-05, CFG-06, DATA-02, DATA-03; sw-architecture.md 19.3.1).
//
// Features and settings are read from the database on every call (never
// cached), so a change made by the CLI applies at once in a running server.
import { and, desc, eq } from "drizzle-orm";
import {
  DEFAULT_FEATURES,
  DEFAULT_SETTINGS,
  EVENT_ID,
  FEATURE_NAMES,
  SETTING_NAMES,
} from "@zappaloo/shared";
import type {
  EventResponse,
  EventSetup,
  EventUpdate,
  FeatureName,
  Features,
  SettingName,
  Settings,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { auditLog, eventFeatures, events, eventSettings } from "../database/schema.ts";

export class EventError extends Error {
  override name = "EventError";
  /** `already_set_up` and `setup_incomplete` are answered with 409. */
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** The example event of dev and test (`zappaloo event seed-example`, CFG-07). */
export const EXAMPLE_EVENT: EventSetup = {
  name: "Event Muster",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
};

/**
 * Who did something: "cli", "user:<id>" (the signed-in user, or the account a guest just
 * created), or "anonymous" (a request without sign-in, e.g. a forgotten password).
 */
export type Actor = string;
export const CLI_ACTOR: Actor = "cli";
export const ANONYMOUS_ACTOR: Actor = "anonymous";
/** Passed to `createUser` by a guest creating their own account: logged as `user:<new id>`. */
export const SELF_ACTOR: Actor = "self";

export function isFeatureName(name: string): name is FeatureName {
  return (FEATURE_NAMES as readonly string[]).includes(name);
}
export function isSettingName(name: string): name is SettingName {
  return (SETTING_NAMES as readonly string[]).includes(name);
}

/**
 * Creates the event on the first start: the fixed id, no name, time zone and language yet
 * (the admin's setup fills them in), features and settings with their defaults. Later starts
 * only fill in keys that are missing, so values changed at runtime are never overwritten.
 * An installation serves one event: a database with another event is refused.
 */
export function ensureEvent(database: Database, now: () => Date = () => new Date()): void {
  database.db.transaction((tx) => {
    const existing = tx.select({ id: events.id }).from(events).all();
    const other = existing.find((row) => row.id !== EVENT_ID);
    if (other) {
      throw new EventError(
        `the database belongs to the event "${other.id}", but an installation serves the event "${EVENT_ID}"`,
      );
    }
    const time = now();
    tx.insert(events)
      .values({ id: EVENT_ID, createdAt: time, updatedAt: time })
      .onConflictDoNothing()
      .run();
    for (const name of FEATURE_NAMES) {
      tx.insert(eventFeatures)
        .values({ eventId: EVENT_ID, name, enabled: DEFAULT_FEATURES[name] })
        .onConflictDoNothing()
        .run();
    }
    for (const name of SETTING_NAMES) {
      tx.insert(eventSettings)
        .values({ eventId: EVENT_ID, name, value: DEFAULT_SETTINGS[name] })
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
          ? "the database has no event yet; start the application once to create it"
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
      timezone: event.timezone,
      defaultLanguage: event.defaultLanguage,
      setupComplete:
        event.name !== null && event.timezone !== null && event.defaultLanguage !== null,
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

  /**
   * Completes the setup (CFG-02): name, time zone and default language, once. Audited.
   * Refuses an event that is already set up.
   */
  setup(input: EventSetup, actor: Actor): EventResponse {
    this.#database.db.transaction((tx) => {
      if (this.get().setupComplete) {
        throw new EventError("the event is already set up", "already_set_up");
      }
      tx.update(events)
        .set({ ...input, updatedAt: this.#now() })
        .where(eq(events.id, this.eventId))
        .run();
      this.audit(actor, "event.setup", { ...input }, tx);
    });
    return this.get();
  }

  /**
   * Changes name, time zone, default language, features and settings at once, all or nothing
   * (CFG-05, CFG-06). Each change is audited; unchanged values are not. Needs the setup to be
   * complete. Returns the event as it is now.
   */
  update(changes: EventUpdate, actor: Actor): EventResponse {
    this.#database.db.transaction((tx) => {
      const current = this.get();
      if (!current.setupComplete) {
        throw new EventError("the event is not set up yet", "setup_incomplete");
      }
      for (const key of ["name", "timezone", "defaultLanguage"] as const) {
        const value = changes[key];
        if (value === undefined || value === current[key]) continue;
        tx.update(events)
          .set({ [key]: value, updatedAt: this.#now() })
          .where(eq(events.id, this.eventId))
          .run();
        this.audit(actor, "event.set", { name: key, from: current[key], to: value }, tx);
      }
      for (const [name, enabled] of Object.entries(changes.features ?? {})) {
        if (isFeatureName(name)) this.setFeature(name, enabled, actor);
      }
      for (const [name, value] of Object.entries(changes.settings ?? {})) {
        if (isSettingName(name)) this.setSetting(name, value, actor);
      }
    });
    return this.get();
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
