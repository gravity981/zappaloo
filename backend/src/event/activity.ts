// The card "Zuletzt" of the admin overview (DATA-05, sw-architecture.md 8.3): the latest
// guest-related changes and changes to settings and content, read from the audit log. The log
// holds ids only (7.1.1), so names are looked up when the entries are shown.
import { desc, eq, inArray, and } from "drizzle-orm";
import { ACTIVITY_ACTIONS } from "@zappaloo/shared";
import type { ActivityAction, ActivityEntry } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  auditLog,
  companions,
  programItems,
  invitations,
  menuOptions,
  users,
} from "../database/schema.ts";
import type { EventService } from "./service.ts";

/**
 * Audit actions the card reads: its own kinds of entry, except the derived `invitation.redeem`,
 * plus the two rows that mean "a guest redeemed an invitation" (see `#action`).
 */
const LISTED = [
  ...ACTIVITY_ACTIONS.filter((action) => action !== "invitation.redeem"),
  "user.create",
  "user.roles",
];

/** How many audit rows to scan: the card shows 5, and rows that are not listed are skipped. */
const SCAN = 500;
/** Equal entries by the same actor this close together are one entry with a count. */
const GROUP_WINDOW_MS = 10 * 60 * 1000;

interface Row {
  id: number;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

/** The id a detail holds, if it is a number. */
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

export class ActivityService {
  readonly #database: Database;
  readonly #event: EventService;

  constructor(database: Database, event: EventService) {
    this.#database = database;
    this.#event = event;
  }

  /** The newest `limit` entries, newest first. */
  latest(limit = 5): ActivityEntry[] {
    const { db } = this.#database;
    const rows: Row[] = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.eventId, this.#event.eventId), inArray(auditLog.action, LISTED)))
      .orderBy(desc(auditLog.id))
      .limit(SCAN)
      .all()
      .map((row) => ({ ...row, details: JSON.parse(row.details) as Record<string, unknown> }));
    const entries: { action: ActivityAction; row: Row; count: number }[] = [];
    for (const row of rows) {
      const action = this.#action(row);
      if (action === undefined) continue;
      const last = entries.at(-1);
      if (
        last?.action === action &&
        last.row.actor === row.actor &&
        last.row.createdAt.getTime() - row.createdAt.getTime() <= GROUP_WINDOW_MS
      ) {
        last.count += action === "rsvp.remind" ? 0 : 1;
        continue;
      }
      entries.push({ action, row, count: 1 });
      if (entries.length > limit) break;
    }
    return entries.slice(0, limit).map(({ action, row, count }) => ({
      action,
      createdAt: row.createdAt.toISOString(),
      count: action === "rsvp.remind" ? (num(row.details.sent) ?? count) : count,
      name: count === 1 || action === "rsvp.remind" ? this.#name(action, row) : null,
    }));
  }

  /** The action as the card words it; undefined for rows that are not listed. */
  #action(row: Row): ActivityAction | undefined {
    if (row.action === "user.create") {
      return row.details.vipAssignment === "invitation_code" ? "invitation.redeem" : undefined;
    }
    if (row.action === "user.roles") {
      return row.details.vipAssignment === "invitation_code" ? "invitation.redeem" : undefined;
    }
    return ACTIVITY_ACTIONS.find((action) => action === row.action);
  }

  /** The guest, invitation or setting the entry is about; null if it no longer exists. */
  #name(action: ActivityAction, row: Row): string | null {
    const { db } = this.#database;
    const userId = num(row.details.userId);
    if (userId !== undefined) {
      return (
        db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).get()
          ?.name ?? null
      );
    }
    const invitationId = num(row.details.invitationId);
    if (invitationId !== undefined) {
      return (
        db
          .select({ name: invitations.guestName })
          .from(invitations)
          .where(eq(invitations.id, invitationId))
          .get()?.name ?? null
      );
    }
    const companionId = num(row.details.companionId);
    if (companionId !== undefined) {
      return (
        db
          .select({ name: companions.name })
          .from(companions)
          .where(eq(companions.id, companionId))
          .get()?.name ?? null
      );
    }
    const programItemId = num(row.details.programItemId);
    if (programItemId !== undefined) {
      return (
        db
          .select({ name: programItems.name })
          .from(programItems)
          .where(eq(programItems.id, programItemId))
          .get()?.name ?? null
      );
    }
    const menuId = num(row.details.menuId);
    if (menuId !== undefined) {
      return (
        db
          .select({ name: menuOptions.name })
          .from(menuOptions)
          .where(eq(menuOptions.id, menuId))
          .get()?.name ?? null
      );
    }
    // Settings and features: the key is a fixed name, not personal data.
    if (action === "feature.set" || action === "setting.set" || action === "event.set") {
      return typeof row.details.name === "string" ? row.details.name : null;
    }
    return null;
  }
}
