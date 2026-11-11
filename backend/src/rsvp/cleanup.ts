// Keeps the RSVP answers in line with the invitation (sw-architecture.md 7.4.1): whoever changes
// a guest's invited parts, deletes a part or revokes `vip` calls these inside the same
// transaction, so the overview never counts an answer for a part the guest is not invited to.
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "../database/database.ts";
import {
  companionAttendance,
  companions,
  membershipParts,
  rsvpAnswers,
  rsvpAttendance,
} from "../database/schema.ts";

type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];
type Reader = Pick<Database["db"], "select">;

/** The guest and the companions of the guest that attend at least one part. */
export interface Attending {
  guest: boolean;
  companions: Set<number>;
}

/** Who of this guest's party attends a part now; taken before a change, given to `pruneAnswers`. */
export function attendingNow(reader: Reader, eventId: string, userId: number): Attending {
  const guest = reader
    .select({ partId: rsvpAttendance.partId })
    .from(rsvpAttendance)
    .where(
      and(
        eq(rsvpAttendance.eventId, eventId),
        eq(rsvpAttendance.userId, userId),
        eq(rsvpAttendance.attending, true),
      ),
    )
    .all();
  const ids = companionIds(reader, eventId, userId);
  const attending = ids.length
    ? reader
        .select({ companionId: companionAttendance.companionId })
        .from(companionAttendance)
        .where(
          and(
            inArray(companionAttendance.companionId, ids),
            eq(companionAttendance.attending, true),
          ),
        )
        .all()
    : [];
  return { guest: guest.length > 0, companions: new Set(attending.map((a) => a.companionId)) };
}

function companionIds(reader: Reader, eventId: string, userId: number): number[] {
  return reader
    .select({ id: companions.id })
    .from(companions)
    .where(and(eq(companions.eventId, eventId), eq(companions.hostUserId, userId)))
    .all()
    .map((row) => row.id);
}

/**
 * After the guest's invited parts changed (or a part was deleted): removes the answers for parts
 * the guest is no longer invited to, for the guest and their companions. Whoever attended a part
 * before and attends none now goes back to "no answer" (decided 2026-11-11): the guest's answer,
 * or the companion's attendance, menu and allergies, are removed, so the wizard asks again.
 */
export function pruneAnswers(tx: Tx, eventId: string, userId: number, before: Attending): void {
  const invited = tx
    .select({ partId: membershipParts.partId })
    .from(membershipParts)
    .where(and(eq(membershipParts.eventId, eventId), eq(membershipParts.userId, userId)))
    .all()
    .map((row) => row.partId);
  tx.delete(rsvpAttendance)
    .where(
      and(
        eq(rsvpAttendance.eventId, eventId),
        eq(rsvpAttendance.userId, userId),
        notInArray(rsvpAttendance.partId, invited),
      ),
    )
    .run();
  const ids = companionIds(tx, eventId, userId);
  if (ids.length > 0) {
    tx.delete(companionAttendance)
      .where(
        and(
          inArray(companionAttendance.companionId, ids),
          notInArray(companionAttendance.partId, invited),
        ),
      )
      .run();
  }
  const after = attendingNow(tx, eventId, userId);
  if (before.guest && !after.guest) {
    tx.delete(rsvpAttendance)
      .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.userId, userId)))
      .run();
    tx.delete(rsvpAnswers)
      .where(and(eq(rsvpAnswers.eventId, eventId), eq(rsvpAnswers.userId, userId)))
      .run();
  }
  const reset = [...before.companions].filter((id) => !after.companions.has(id));
  if (reset.length > 0) {
    tx.delete(companionAttendance).where(inArray(companionAttendance.companionId, reset)).run();
    tx.update(companions)
      .set({ menuId: null, allergies: null })
      .where(inArray(companions.id, reset))
      .run();
  }
}

/**
 * When `vip` is revoked, the guest's RSVP goes with it (decided 2026-11-11, SEC-11): invited
 * parts, answer, attendance and the accompanying persons with their allergies.
 */
export function forgetGuest(tx: Tx, eventId: string, userId: number): void {
  tx.delete(membershipParts)
    .where(and(eq(membershipParts.eventId, eventId), eq(membershipParts.userId, userId)))
    .run();
  tx.delete(rsvpAttendance)
    .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.userId, userId)))
    .run();
  tx.delete(rsvpAnswers)
    .where(and(eq(rsvpAnswers.eventId, eventId), eq(rsvpAnswers.userId, userId)))
    .run();
  // Their attendance goes by cascade.
  tx.delete(companions)
    .where(and(eq(companions.eventId, eventId), eq(companions.hostUserId, userId)))
    .run();
}
