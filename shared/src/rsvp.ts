// RSVP, event parts and menus (sw-architecture.md 7.4, 7.4.1): the schemas of the RSVP API,
// shared by backend and frontend.
import { z } from "zod";

const idSchema = z.number().int().positive();

export const partNameSchema = z.string().trim().min(1).max(60);
export const placeSchema = z.string().trim().min(1).max(100);
export const menuNameSchema = z.string().trim().min(1).max(60);
export const allergiesSchema = z.string().trim().min(1).max(500);
export const songWishSchema = z.string().trim().min(1).max(200);
/** A calendar day, `2027-05-01`. */
export const dateSchema = z.iso.date();

/** An event part: ceremony, aperitif, dinner, party (RSVP-02). */
export const eventPartSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** ISO date-time. */
  startsAt: z.string(),
  place: z.string().nullable(),
  /** The part that has the meal: the menu is asked only for persons attending it. */
  hasMeal: z.boolean(),
});
export type EventPart = z.infer<typeof eventPartSchema>;

export const menuOptionSchema = z.object({ id: idSchema, name: z.string() });
export type MenuOption = z.infer<typeof menuOptionSchema>;

/** `POST`/`PATCH /api/admin/rsvp/parts`: a part; a change names what changes. */
export const eventPartRequestSchema = z.strictObject({
  name: partNameSchema,
  startsAt: z.iso.datetime(),
  place: placeSchema.nullable().optional(),
  hasMeal: z.boolean().optional(),
});
export type EventPartRequest = z.infer<typeof eventPartRequestSchema>;
export const eventPartUpdateSchema = z
  .strictObject({
    name: partNameSchema.optional(),
    startsAt: z.iso.datetime().optional(),
    place: placeSchema.nullable().optional(),
    hasMeal: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "name at least one value" });
export type EventPartUpdate = z.infer<typeof eventPartUpdateSchema>;

export const menuRequestSchema = z.strictObject({ name: menuNameSchema });
export type MenuRequest = z.infer<typeof menuRequestSchema>;

/** `PUT /api/admin/rsvp/deadline`: the last day guests can change the RSVP; null removes it. */
export const deadlineRequestSchema = z.strictObject({ deadline: dateSchema.nullable() });
export type DeadlineRequest = z.infer<typeof deadlineRequestSchema>;

/** `GET /api/admin/rsvp/config`: deadline, parts and menus (Einstellungen › Rückmeldung). */
export const rsvpConfigSchema = z.object({
  deadline: dateSchema.nullable(),
  parts: z.array(eventPartSchema),
  menus: z.array(menuOptionSchema),
});
export type RsvpConfig = z.infer<typeof rsvpConfigSchema>;

/** The answer of one person: attendance per invited part, menu, allergies. */
export const attendanceSchema = z.object({ partId: idSchema, attending: z.boolean() });

/** `PUT /api/rsvp`, and the admin's change of a guest's RSVP (RSVP-01, RSVP-03, RSVP-06). */
export const rsvpAnswerRequestSchema = z.strictObject({
  attendance: z.array(attendanceSchema).max(50),
  /** Needed for a person who attends the meal part while menus exist; ignored otherwise. */
  menuId: idSchema.nullable().optional(),
  allergies: allergiesSchema.nullable().optional(),
  songWish: songWishSchema.nullable().optional(),
});
export type RsvpAnswerRequest = z.infer<typeof rsvpAnswerRequestSchema>;

export const rsvpAnswerSchema = z.object({
  /** The parts the person attends. */
  attendingPartIds: z.array(idSchema),
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
  /** The parts the guest is invited to. */
  parts: z.array(eventPartSchema),
  menus: z.array(menuOptionSchema),
  answer: rsvpAnswerSchema.nullable(),
});
export type RsvpState = z.infer<typeof rsvpStateSchema>;

export const RSVP_STATUSES = ["attending", "declined", "none"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** One row of the guest table (RSVP-04, RSVP-05); `allergies` is for admins only (SEC-11). */
export const rsvpGuestSchema = z.object({
  userId: idSchema,
  name: z.string(),
  status: z.enum(RSVP_STATUSES),
  invitedPartIds: z.array(idSchema),
  attendingPartIds: z.array(idSchema),
  menuId: idSchema.nullable(),
  songWish: z.string().nullable(),
  allergies: z.string().nullable(),
  /** True if the guest has a verified email address (a reminder can reach them). */
  verifiedEmail: z.boolean(),
});
export type RsvpGuest = z.infer<typeof rsvpGuestSchema>;

/** `GET /api/admin/rsvp`: the overview. */
export const rsvpOverviewSchema = z.object({
  deadline: dateSchema.nullable(),
  parts: z.array(eventPartSchema),
  menus: z.array(menuOptionSchema),
  /** Per part: guests who answered yes and no (invited and answered, not attending). */
  totals: z.array(z.object({ partId: idSchema, yes: z.number().int(), no: z.number().int() })),
  /** Menu choices of the persons attending the meal part; menuId null = no choice made. */
  menuTotals: z.array(z.object({ menuId: idSchema.nullable(), count: z.number().int() })),
  guests: z.array(rsvpGuestSchema),
  answered: z.number().int(),
  total: z.number().int(),
  /** Guests without an answer who have a verified address: the "Erinnern (n)" count. */
  reminderCount: z.number().int(),
});
export type RsvpOverview = z.infer<typeof rsvpOverviewSchema>;

/** `GET /api/admin/rsvp/guests/:id`: the wizard in admin mode (deadline ignored). */
export const rsvpAdminStateSchema = rsvpStateSchema;

/** `PUT /api/admin/invitations/:id/parts` and `PUT /api/admin/users/:id/parts`. */
export const invitedPartsRequestSchema = z.strictObject({
  partIds: z.array(idSchema).max(50),
});
export type InvitedPartsRequest = z.infer<typeof invitedPartsRequestSchema>;

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
  "rsvp.part.create",
  "rsvp.part.update",
  "rsvp.part.delete",
  "rsvp.menu.create",
  "rsvp.menu.update",
  "rsvp.menu.delete",
  "invitation.create",
  "invitation.redeem",
  "invitation.regenerate",
  "invitation.revoke",
  "invitation.parts",
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
  /** The guest or part concerned, resolved when displayed; null if it no longer exists. */
  name: z.string().nullable(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
export const activityResponseSchema = z.object({ entries: z.array(activityEntrySchema) });
