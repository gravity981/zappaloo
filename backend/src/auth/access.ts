// Access conditions (ACS-05, ACS-06; sw-architecture.md 11): evaluates a condition for a
// signed-in user, and keeps the manual releases. Every check reads the current state, so a
// revoked role, a left group or a withdrawn release takes effect at once (11.1).
import { and, eq } from "drizzle-orm";
import type { AccessCondition, User } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { accessReleases } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import type { GroupService } from "./groups.ts";

export class AccessService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #groups: GroupService;
  readonly #now: () => Date;

  constructor(
    database: Database,
    event: EventService,
    groups: GroupService,
    now: () => Date = () => new Date(),
  ) {
    this.#database = database;
    this.#event = event;
    this.#groups = groups;
    this.#now = now;
  }

  /**
   * Whether the user meets the condition. `all` parts are combined with AND (an empty `all`
   * is true: signed in is enough), `any` parts with OR (an empty `any` is false). No role
   * stands in for another: an admin passes a `vip` condition only with the role `vip` (ROLE-08).
   */
  check(user: User, condition: AccessCondition): boolean {
    if ("all" in condition) return condition.all.every((part) => this.check(user, part));
    if ("any" in condition) return condition.any.some((part) => this.check(user, part));
    switch (condition.type) {
      case "role":
        return user.roles.includes(condition.role);
      case "group":
        return this.#groups.isInGroup(user.id, condition.group);
      case "time": {
        const now = this.#now().getTime();
        return (
          (condition.from === undefined || now >= Date.parse(condition.from)) &&
          (condition.until === undefined || now < Date.parse(condition.until))
        );
      }
      case "release":
        return this.isReleased(condition.key);
      case "feature":
        return this.#event.isFeatureEnabled(condition.feature);
    }
  }

  isReleased(key: string): boolean {
    return (
      this.#database.db
        .select({ key: accessReleases.key })
        .from(accessReleases)
        .where(and(eq(accessReleases.eventId, this.#event.eventId), eq(accessReleases.key, key)))
        .get() !== undefined
    );
  }

  /** Switches a manual release on; releasing twice changes nothing. */
  release(key: string, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const added = tx
        .insert(accessReleases)
        .values({ eventId: this.#event.eventId, key, releasedAt: this.#now() })
        .onConflictDoNothing()
        .run();
      if (added.changes > 0) this.#event.audit(actor, "release.set", { key }, tx);
    });
  }

  /** Withdraws a release, so the areas that wait for it are closed again. */
  withdraw(key: string, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const removed = tx
        .delete(accessReleases)
        .where(and(eq(accessReleases.eventId, this.#event.eventId), eq(accessReleases.key, key)))
        .run();
      if (removed.changes > 0) this.#event.audit(actor, "release.withdraw", { key }, tx);
    });
  }

  releases(): { key: string; releasedAt: string }[] {
    return this.#database.db
      .select()
      .from(accessReleases)
      .where(eq(accessReleases.eventId, this.#event.eventId))
      .orderBy(accessReleases.key)
      .all()
      .map((row) => ({ key: row.key, releasedAt: row.releasedAt.toISOString() }));
  }
}
