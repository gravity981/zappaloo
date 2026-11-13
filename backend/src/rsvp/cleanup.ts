// Keeps the RSVP answers in line with the invitation (sw-architecture.md 7.4.1): whoever changes
// a guest's invited program items, deletes a program item or revokes `vip` calls these inside the same
// transaction, so the overview never counts an answer for a program item the guest is not invited to.
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "../database/database.ts";
import {
  companionAttendance,
  companions,
  membershipProgramItems,
  rsvpAnswers,
  rsvpAttendance,
  rsvpConfig,
} from "../database/schema.ts";

type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];
type Reader = Pick<Database["db"], "select">;

/** The guest and the companions of the guest that attend at least one program item. */
export interface Attending {
  guest: boolean;
  companions: Set<number>;
}

/** Who of this guest's party attends a program item now; taken before a change, given to `pruneAnswers`. */
export function attendingNow(reader: Reader, eventId: string, userId: number): Attending {
  const guest = reader
    .select({ programItemId: rsvpAttendance.programItemId })
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
 * After the guest's invited program items changed (or a program item was deleted): removes the answers for program items
 * the guest is no longer invited to, for the guest and their companions. Whoever attended a program item
 * before and attends none now goes back to "no answer" (decided 2026-11-11): the guest's answer,
 * or the companion's attendance, menu and allergies, are removed, so the wizard asks again.
 */
export function pruneAnswers(tx: Tx, eventId: string, userId: number, before: Attending): void {
  const invited = tx
    .select({ programItemId: membershipProgramItems.programItemId })
    .from(membershipProgramItems)
    .where(
      and(eq(membershipProgramItems.eventId, eventId), eq(membershipProgramItems.userId, userId)),
    )
    .all()
    .map((row) => row.programItemId);
  tx.delete(rsvpAttendance)
    .where(
      and(
        eq(rsvpAttendance.eventId, eventId),
        eq(rsvpAttendance.userId, userId),
        notInArray(rsvpAttendance.programItemId, invited),
      ),
    )
    .run();
  const ids = companionIds(tx, eventId, userId);
  if (ids.length > 0) {
    tx.delete(companionAttendance)
      .where(
        and(
          inArray(companionAttendance.companionId, ids),
          notInArray(companionAttendance.programItemId, invited),
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
  fillAnswers(tx, eventId, userId, invited);
}

/**
 * With one answer per person (RSVP-11) a program item that was added to the invitation takes the
 * person's existing answer, so nobody is asked again: a yes if they attend any program item, else a
 * no. This is for the guest and their companions; whoever has not answered stays unanswered.
 */
function fillAnswers(tx: Tx, eventId: string, userId: number, invited: number[]): void {
  const perItem =
    tx
      .select({ perItem: rsvpConfig.perItem })
      .from(rsvpConfig)
      .where(eq(rsvpConfig.eventId, eventId))
      .get()?.perItem ?? false;
  if (perItem) return;
  const own = tx
    .select({ programItemId: rsvpAttendance.programItemId, attending: rsvpAttendance.attending })
    .from(rsvpAttendance)
    .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.userId, userId)))
    .all();
  if (own.length > 0) {
    const attending = own.some((row) => row.attending);
    const have = new Set(own.map((row) => row.programItemId));
    for (const programItemId of invited.filter((id) => !have.has(id))) {
      tx.insert(rsvpAttendance).values({ eventId, userId, programItemId, attending }).run();
    }
  }
  for (const companionId of companionIds(tx, eventId, userId)) {
    const rows = tx
      .select({
        programItemId: companionAttendance.programItemId,
        attending: companionAttendance.attending,
      })
      .from(companionAttendance)
      .where(eq(companionAttendance.companionId, companionId))
      .all();
    if (rows.length === 0) continue;
    const attending = rows.some((row) => row.attending);
    const have = new Set(rows.map((row) => row.programItemId));
    for (const programItemId of invited.filter((id) => !have.has(id))) {
      tx.insert(companionAttendance)
        .values({ eventId, companionId, programItemId, attending })
        .run();
    }
  }
}

/**
 * When `vip` is revoked, the guest's RSVP goes with it (decided 2026-11-11, SEC-11): invited
 * program items, answer, attendance and the accompanying persons with their allergies.
 */
export function forgetGuest(tx: Tx, eventId: string, userId: number): void {
  tx.delete(membershipProgramItems)
    .where(
      and(eq(membershipProgramItems.eventId, eventId), eq(membershipProgramItems.userId, userId)),
    )
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
