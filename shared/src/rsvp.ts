// RSVP, program items and menus (sw-architecture.md 7.4, 7.4.1): the schemas of the RSVP API,
// shared by backend and frontend.
import { z } from "zod";

const idSchema = z.number().int().positive();

export const programItemNameSchema = z.string().trim().min(1).max(60);
export const placeSchema = z.string().trim().min(1).max(100);
export const menuNameSchema = z.string().trim().min(1).max(60);
export const allergiesSchema = z.string().trim().min(1).max(500);
export const songWishSchema = z.string().trim().min(1).max(200);
/** A calendar day, `2027-05-01`. */
export const dateSchema = z.iso.date();

/** A program item: ceremony, aperitif, dinner, party (RSVP-02). */
export const programItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** ISO date-time. */
  startsAt: z.string(),
  place: z.string().nullable(),
  /** The program item that has the meal: the menu is asked only for persons attending it. */
  hasMeal: z.boolean(),
});
export type ProgramItem = z.infer<typeof programItemSchema>;

export const menuOptionSchema = z.object({ id: idSchema, name: z.string() });
export type MenuOption = z.infer<typeof menuOptionSchema>;

/** `POST`/`PATCH /api/admin/rsvp/program-items`: a program item; a change names what changes. */
export const programItemRequestSchema = z.strictObject({
  name: programItemNameSchema,
  startsAt: z.iso.datetime(),
  place: placeSchema.nullable().optional(),
  hasMeal: z.boolean().optional(),
});
export type ProgramItemRequest = z.infer<typeof programItemRequestSchema>;
export const programItemUpdateSchema = z
  .strictObject({
    name: programItemNameSchema.optional(),
    startsAt: z.iso.datetime().optional(),
    place: placeSchema.nullable().optional(),
    hasMeal: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "name at least one value" });
export type ProgramItemUpdate = z.infer<typeof programItemUpdateSchema>;

export const menuRequestSchema = z.strictObject({ name: menuNameSchema });
export type MenuRequest = z.infer<typeof menuRequestSchema>;

/** `PUT /api/admin/rsvp/deadline`: the last day guests can change the RSVP; null removes it. */
export const deadlineRequestSchema = z.strictObject({ deadline: dateSchema.nullable() });
export type DeadlineRequest = z.infer<typeof deadlineRequestSchema>;

/** `PUT /api/admin/rsvp/song`: switches the song wish on or off. */
export const songEnabledRequestSchema = z.strictObject({ enabled: z.boolean() });

/** `GET /api/admin/rsvp/config`: deadline, program items and menus (Einstellungen › Rückmeldung). */
export const rsvpConfigSchema = z.object({
  deadline: dateSchema.nullable(),
  /** Whether the RSVP asks for a song wish (RSVP-06). */
  songEnabled: z.boolean(),
  programItems: z.array(programItemSchema),
  menus: z.array(menuOptionSchema),
});
export type RsvpConfig = z.infer<typeof rsvpConfigSchema>;

/** At most this many accompanying persons per guest, pending and approved together. */
export const MAX_COMPANIONS = 10;

export const COMPANION_STATUSES = ["pending", "approved", "rejected"] as const;
export type CompanionStatus = (typeof COMPANION_STATUSES)[number];

/** An accompanying person as their guest sees them (RSVP-08 – RSVP-10). */
export const companionSchema = z.object({
  id: idSchema,
  name: z.string(),
  note: z.string().nullable(),
  status: z.enum(COMPANION_STATUSES),
  attendingItemIds: z.array(idSchema),
  /** The program items answered with no; an invited program item in neither list is not answered yet. */
  declinedItemIds: z.array(idSchema),
  menuId: idSchema.nullable(),
  allergies: z.string().nullable(),
});
export type Companion = z.infer<typeof companionSchema>;

export const companionNameSchema = z.string().trim().min(1).max(100);
export const companionNoteSchema = z.string().trim().min(1).max(500);

/** The attendance, menu and allergies of one person, as in the wizard. */
const personAnswerShape = {
  attendance: z.array(z.strictObject({ programItemId: idSchema, attending: z.boolean() })).max(50),
  menuId: idSchema.nullable().optional(),
  allergies: z.string().trim().min(1).max(500).nullable().optional(),
};

/** `POST`/`PUT /api/rsvp/companions`: a request, or the change of a pending one (RSVP-08, RSVP-10). */
export const companionRequestSchema = z.strictObject({
  name: companionNameSchema,
  note: companionNoteSchema.nullable().optional(),
  ...personAnswerShape,
});
export type CompanionRequest = z.infer<typeof companionRequestSchema>;

/** `PATCH /api/admin/rsvp/companions/:id`: the name of an approved person (7.4.1). */
export const companionRenameSchema = z.strictObject({ name: companionNameSchema });

/** The answer of one person: attendance per invited program item, menu, allergies. */
export const attendanceSchema = z.object({ programItemId: idSchema, attending: z.boolean() });

/** `PUT /api/rsvp`, and the admin's change of a guest's RSVP (RSVP-01, RSVP-03, RSVP-06). */
export const rsvpAnswerRequestSchema = z.strictObject({
  attendance: z.array(attendanceSchema).max(50),
  /** Needed for a person who attends the meal program item while menus exist; ignored otherwise. */
  menuId: idSchema.nullable().optional(),
  allergies: allergiesSchema.nullable().optional(),
  songWish: songWishSchema.nullable().optional(),
  /** Attendance, menu and allergies of companions (pending or approved), by id (RSVP-09). */
  companions: z
    .array(z.strictObject({ companionId: idSchema, ...personAnswerShape }))
    .max(MAX_COMPANIONS)
    .optional(),
});
export type RsvpAnswerRequest = z.infer<typeof rsvpAnswerRequestSchema>;

export const rsvpAnswerSchema = z.object({
  /** The program items the person attends. */
  attendingItemIds: z.array(idSchema),
  /**
   * The program items answered with no. An invited program item in neither list is not answered yet: it was
   * added to the invitation after the answer (7.4.1).
   */
  declinedItemIds: z.array(idSchema),
  menuId: idSchema.nullable(),
  allergies: z.string().nullable(),
  songWish: z.string().nullable(),
  answeredAt: z.string(),
});
export type RsvpAnswer = z.infer<typeof rsvpAnswerSchema>;

/** `GET /api/rsvp`: what the wizard needs. */
export const rsvpStateSchema = z.object({
  /** The guest's name, for "Bist du dabei, Erika?". */
  name: z.string(),
  /** The last day to change the answer, or null. */
  deadline: dateSchema.nullable(),
  /** True once the deadline has passed (the guest cannot change anything any more). */
  closed: z.boolean(),
  /** Whether the wizard asks for a song wish (RSVP-06). */
  songEnabled: z.boolean(),
  /** The program items the guest is invited to. */
  programItems: z.array(programItemSchema),
  menus: z.array(menuOptionSchema),
  answer: rsvpAnswerSchema.nullable(),
  /** The guest's accompanying persons, all statuses. */
  companions: z.array(companionSchema),
});
export type RsvpState = z.infer<typeof rsvpStateSchema>;

export const RSVP_STATUSES = ["attending", "declined", "none"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/**
 * The status of a guest's RSVP (7.4.1): attending once they attend a program item; declined once they
 * have answered every invited program item with no; otherwise no answer (also when a program item was added to
 * the invitation after they declined the others).
 */
export function rsvpStatus(
  answered: boolean,
  invitedProgramItemIds: readonly number[],
  attendingItemIds: readonly number[],
  declinedItemIds: readonly number[],
): RsvpStatus {
  if (!answered) return "none";
  if (attendingItemIds.some((id) => invitedProgramItemIds.includes(id))) return "attending";
  return invitedProgramItemIds.every((id) => declinedItemIds.includes(id)) ? "declined" : "none";
}

/** A person attending the program item with the meal chooses a menu, as long as menus exist (RSVP-03). */
export function menuRequired(
  programItems: readonly Pick<ProgramItem, "id" | "hasMeal">[],
  menuCount: number,
  attendingItemIds: readonly number[],
): boolean {
  const meal = programItems.find((programItem) => programItem.hasMeal);
  return meal !== undefined && menuCount > 0 && attendingItemIds.includes(meal.id);
}

/** One row of the guest table (RSVP-04, RSVP-05); `allergies` is for admins only (SEC-11). */
export const rsvpGuestSchema = z.object({
  userId: idSchema,
  name: z.string(),
  status: z.enum(RSVP_STATUSES),
  invitedProgramItemIds: z.array(idSchema),
  attendingItemIds: z.array(idSchema),
  /** The program items answered with no; an invited program item in neither list is not answered yet. */
  declinedItemIds: z.array(idSchema),
  menuId: idSchema.nullable(),
  songWish: z.string().nullable(),
  allergies: z.string().nullable(),
  /** True if the guest has a verified email address (a reminder can reach them). */
  verifiedEmail: z.boolean(),
});
export type RsvpGuest = z.infer<typeof rsvpGuestSchema>;

/** A companion in the admin overview, with the guest who asked. */
export const rsvpCompanionSchema = companionSchema.extend({
  hostUserId: idSchema,
  hostName: z.string(),
});
export type RsvpCompanion = z.infer<typeof rsvpCompanionSchema>;

/** `GET /api/admin/rsvp`: the overview. */
export const rsvpOverviewSchema = z.object({
  deadline: dateSchema.nullable(),
  /** Whether the song wish is asked; the table shows its column only then. */
  songEnabled: z.boolean(),
  programItems: z.array(programItemSchema),
  menus: z.array(menuOptionSchema),
  /** Per program item: persons who answered yes and who answered no; a program item not answered yet counts in neither. */
  totals: z.array(
    z.object({ programItemId: idSchema, yes: z.number().int(), no: z.number().int() }),
  ),
  /** Menu choices of the persons attending the meal program item; menuId null = no choice made. */
  menuTotals: z.array(z.object({ menuId: idSchema.nullable(), count: z.number().int() })),
  guests: z.array(rsvpGuestSchema),
  /** Every companion request; approved ones count in totals, menus and the table (RSVP-09). */
  companions: z.array(rsvpCompanionSchema),
  /** Requests waiting for a decision. */
  pendingCount: z.number().int(),
  answered: z.number().int(),
  total: z.number().int(),
  /** Guests without an answer who have a verified address: the "Erinnern (n)" count. */
  reminderCount: z.number().int(),
});
export type RsvpOverview = z.infer<typeof rsvpOverviewSchema>;

/** `GET /api/admin/rsvp/pending`: requests waiting for a decision, for the navigation badge. */
export const rsvpPendingSchema = z.object({ pendingCount: z.number().int() });

/** `GET /api/admin/rsvp/guests/:id`: the wizard in admin mode (deadline ignored). */
export const rsvpAdminStateSchema = rsvpStateSchema;

/** `PUT /api/admin/invitations/:id/program items` and `PUT /api/admin/users/:id/program items`. */
export const invitedProgramItemsRequestSchema = z.strictObject({
  programItemIds: z.array(idSchema).max(50),
});
export type InvitedProgramItemsRequest = z.infer<typeof invitedProgramItemsRequestSchema>;

/** `POST /api/admin/rsvp/remind`: how many reminders were sent. */
export const remindResponseSchema = z.object({ sent: z.number().int() });

/**
 * The kinds of entry the card "Zuletzt" shows (DATA-05); logins, sign-outs and role changes are
 * not among them. `invitation.redeem` is derived from the audit entries of an account that was
 * created or promoted by redeeming an invitation.
 */
export const ACTIVITY_ACTIONS = [
  "rsvp.answer",
  "rsvp.admin_answer",
  "rsvp.remind",
  "rsvp.deadline",
  "rsvp.song",
  "waiting.set",
  "platform.open",
  "platform.close",
  "privacy.set",
  "rsvp.program_item.create",
  "rsvp.program_item.update",
  "rsvp.program_item.delete",
  "rsvp.menu.create",
  "rsvp.menu.update",
  "rsvp.menu.delete",
  "invitation.create",
  "invitation.redeem",
  "invitation.regenerate",
  "invitation.revoke",
  "invitation.program_items",
  "user.program_items",
  "companion.request",
  "companion.approve",
  "companion.reject",
  "companion.withdraw",
  "companion.rename",
  "event.setup",
  "event.set",
  "feature.set",
  "setting.set",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** One entry of the card "Zuletzt" (DATA-05). */
export const activityEntrySchema = z.object({
  /** The kind of entry, e.g. `rsvp.answer`; the frontend words it. */
  action: z.enum(ACTIVITY_ACTIONS),
  createdAt: z.string(),
  /** Several equal entries in a row (e.g. a batch of invitations) are one entry with a count. */
  count: z.number().int(),
  /** The guest or program item concerned, resolved when displayed; null if it no longer exists. */
  name: z.string().nullable(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
export const activityResponseSchema = z.object({ entries: z.array(activityEntrySchema) });
