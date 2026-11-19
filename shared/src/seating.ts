// The seating plan and the table finder (sw-architecture.md 3.6; PRES-05 – PRES-07, PRES-12): the admin makes the
// tables (a name and the number of places) and places the attending persons on them, guests look up their table and
// their tablemates. Where at a table somebody sits is not part of Zappaloo, and the game world has no seats (decided
// 2026-11-18).
import { z } from "zod";

export const SEATING_LIMITS = {
  /** The name of a table, in characters, and its number of places. */
  name: 40,
  places: 100,
} as const;

/** A person of the plan: a guest or an approved companion who attends. */
export const seatingPersonSchema = z.object({
  /** `u<user id>` or `c<companion id>`, as in the guest list of the game. */
  key: z.string(),
  name: z.string(),
  /** For a companion, the name of the guest who brought them. */
  companionOf: z.string().nullable(),
  /** Whether the admin placed this person; a companion who is not follows the guest's table. */
  placed: z.boolean(),
});
export type SeatingPerson = z.infer<typeof seatingPersonSchema>;

export const seatingTableSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  places: z.number().int().positive(),
  persons: z.array(seatingPersonSchema),
});
export type SeatingTable = z.infer<typeof seatingTableSchema>;

/** `GET /api/admin/seating`: the tables with their persons, and who has no table yet. */
export const adminSeatingResponseSchema = z.object({
  /** When guests see the plan (ISO date-time), or null: hidden. */
  visibleFrom: z.string().nullable(),
  tables: z.array(seatingTableSchema),
  unassigned: z.array(seatingPersonSchema),
});
export type AdminSeatingResponse = z.infer<typeof adminSeatingResponseSchema>;

/** `PUT /api/admin/seating/assignments/:key`: the id of the person's table, or none (a companion then follows the guest). */
export const seatingAssignRequestSchema = z.strictObject({
  table: z.number().int().positive().nullable(),
});

/** `POST /api/admin/seating/tables` and `PUT /api/admin/seating/tables/:id`: a table's name and number of places. */
export const seatingTableRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(SEATING_LIMITS.name),
  places: z.number().int().min(1).max(SEATING_LIMITS.places),
});

/** `PUT /api/admin/seating/visibility`. */
export const seatingVisibilityRequestSchema = z.strictObject({
  visibleFrom: z.iso.datetime().nullable(),
});

/** A tablemate in the table finder (PRES-12): name, photo, greeting and "How I know the couple". */
export const seatingMateSchema = z.object({
  key: z.string(),
  name: z.string(),
  companionOf: z.string().nullable(),
  greeting: z.string().nullable(),
  badge: z.string().nullable(),
  line: z.string().nullable(),
  /** The version of the photo for its address, or null. */
  photo: z.number().int().nullable(),
});
export type SeatingMate = z.infer<typeof seatingMateSchema>;

/** A table of the guest or of one of their companions, with the persons of the guest's party at it and its other guests. */
export const seatingGuestTableSchema = z.object({
  name: z.string(),
  places: z.number().int().positive(),
  /** The names of the guest's own party at this table. */
  party: z.array(z.string()),
  mates: z.array(seatingMateSchema),
});
export type SeatingGuestTable = z.infer<typeof seatingGuestTableSchema>;

/** `GET /api/seating`: before `visibleFrom` (or without a date) there is no plan to show. */
export const seatingGuestResponseSchema = z.object({
  visible: z.boolean(),
  visibleFrom: z.string().nullable(),
  tables: z.array(seatingGuestTableSchema),
});
export type SeatingGuestResponse = z.infer<typeof seatingGuestResponseSchema>;
