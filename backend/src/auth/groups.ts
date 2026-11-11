// Guest groups (GRP-01, GRP-02; sw-architecture.md 12): named sets of members,
// independent of roles. The access conditions that use them are built in step 2f.
import { and, eq, sql } from "drizzle-orm";
import type { Group } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { guestGroupMembers, guestGroups, memberships } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";

export type GroupErrorCode = "group_not_found" | "group_name_taken" | "user_not_found";

export class GroupError extends Error {
  override name = "GroupError";
  readonly code: GroupErrorCode;
  constructor(code: GroupErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class GroupService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #now: () => Date;

  constructor(database: Database, event: EventService, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#event = event;
    this.#now = now;
  }

  list(): Group[] {
    const { db } = this.#database;
    const groups = db
      .select()
      .from(guestGroups)
      .where(eq(guestGroups.eventId, this.#event.eventId))
      .orderBy(guestGroups.nameKey)
      .all();
    const members = db
      .select()
      .from(guestGroupMembers)
      .where(eq(guestGroupMembers.eventId, this.#event.eventId))
      .orderBy(guestGroupMembers.userId)
      .all();
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.userId),
    }));
  }

  create(name: string, actor: Actor): Group {
    return this.#database.db.transaction((tx) => {
      this.#assertNameFree(tx, name);
      const row = tx
        .insert(guestGroups)
        .values({
          eventId: this.#event.eventId,
          name,
          nameKey: name.toLowerCase(),
          createdAt: this.#now(),
        })
        .returning()
        .get();
      this.#event.audit(actor, "group.create", { groupId: row.id, name }, tx);
      return { id: row.id, name, memberIds: [] };
    });
  }

  rename(groupId: number, name: string, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const group = this.#find(tx, groupId);
      this.#assertNameFree(tx, name, groupId);
      tx.update(guestGroups)
        .set({ name, nameKey: name.toLowerCase() })
        .where(eq(guestGroups.id, groupId))
        .run();
      this.#event.audit(actor, "group.rename", { groupId, from: group.name, to: name }, tx);
    });
  }

  /** Deletes the group; its memberships go with it. */
  delete(groupId: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const group = this.#find(tx, groupId);
      tx.delete(guestGroups).where(eq(guestGroups.id, groupId)).run();
      this.#event.audit(actor, "group.delete", { groupId, name: group.name }, tx);
    });
  }

  /** Adds a member of the event to the group; adding twice changes nothing. */
  addMember(groupId: number, userId: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#find(tx, groupId);
      const member = tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.eventId, this.#event.eventId), eq(memberships.userId, userId)))
        .get();
      if (!member) throw new GroupError("user_not_found", "no such user");
      const added = tx
        .insert(guestGroupMembers)
        .values({ eventId: this.#event.eventId, groupId, userId })
        .onConflictDoNothing()
        .run();
      if (added.changes > 0) this.#event.audit(actor, "group.addMember", { groupId, userId }, tx);
    });
  }

  removeMember(groupId: number, userId: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#find(tx, groupId);
      const removed = tx
        .delete(guestGroupMembers)
        .where(and(eq(guestGroupMembers.groupId, groupId), eq(guestGroupMembers.userId, userId)))
        .run();
      if (removed.changes > 0) {
        this.#event.audit(actor, "group.removeMember", { groupId, userId }, tx);
      }
    });
  }

  /** Whether the user is in the group with this name (for access conditions, ACS-05). */
  isInGroup(userId: number, groupName: string): boolean {
    return (
      this.#database.db
        .select({ userId: guestGroupMembers.userId })
        .from(guestGroupMembers)
        .innerJoin(guestGroups, eq(guestGroups.id, guestGroupMembers.groupId))
        .where(
          and(
            eq(guestGroups.eventId, this.#event.eventId),
            eq(guestGroups.nameKey, groupName.toLowerCase()),
            eq(guestGroupMembers.userId, userId),
          ),
        )
        .get() !== undefined
    );
  }

  #find(tx: Pick<Database["db"], "select">, groupId: number) {
    const group = tx
      .select()
      .from(guestGroups)
      .where(and(eq(guestGroups.id, groupId), eq(guestGroups.eventId, this.#event.eventId)))
      .get();
    if (!group) throw new GroupError("group_not_found", "no such group");
    return group;
  }

  #assertNameFree(tx: Pick<Database["db"], "select">, name: string, exceptId?: number): void {
    const taken = tx
      .select({ id: guestGroups.id })
      .from(guestGroups)
      .where(
        and(
          eq(guestGroups.eventId, this.#event.eventId),
          eq(guestGroups.nameKey, name.toLowerCase()),
          exceptId === undefined ? undefined : sql`${guestGroups.id} <> ${exceptId}`,
        ),
      )
      .get();
    if (taken) throw new GroupError("group_name_taken", `the group "${name}" already exists`);
  }
}
