// RSVP, program items and menus (sw-architecture.md 7.4, 7.4.1): the schemas of the RSVP API,
// shared by backend and frontend.
import { z } from "zod";

const idSchema = z.number().int().positive();

/** Every person on the guest list is an adult or a child (RSVP-13). */
export const PERSON_TYPES = ["adult", "child"] as const;
export const personTypeSchema = z.enum(PERSON_TYPES);
export type PersonType = z.infer<typeof personTypeSchema>;

/** `PUT /api/admin/users/:id/person-type`: the admin sets the type of a guest. */
export const personTypeRequestSchema = z.strictObject({ personType: personTypeSchema });
export type PersonTypeRequest = z.infer<typeof personTypeRequestSchema>;

export const programItemNameSchema = z.string().trim().min(1).max(60);
export const menuNameSchema = z.string().trim().min(1).max(60);
/** The Kürzel of a program item or a menu (RSVP-23): 1 – 2 characters. */
export const shortCodeSchema = z.string().trim().min(1).max(2);

/** What a table shows for a program item or a menu: its Kürzel, by default the first letter (RSVP-23). */
export function shortCodeOf(entry: { name: string; shortCode: string | null }): string {
  return entry.shortCode ?? entry.name.trim().charAt(0).toUpperCase();
}
export const allergiesSchema = z.string().trim().min(1).max(500);
/** "Sonstiges/Anmerkungen" of the main invitee (RSVP-20): optional, at most 500 characters. */
export const remarksSchema = z.string().trim().min(1).max(500);
export const songWishSchema = z.string().trim().min(1).max(200);
/** A calendar day, `2027-05-01`. */
export const dateSchema = z.iso.date();

/**
 * An activity of a program item: what the programme shows (WEB-12). It has a name, a start, an
 * optional end and a place of its own.
 */
export const activitySchema = z.object({
  id: idSchema,
  name: z.string(),
  /** ISO date-time. */
  startsAt: z.string(),
  /** ISO date-time of the end, or null: the activity has no end (WEB-07). */
  endsAt: z.string().nullable(),
  /** The place from Inhalte (CNT-07), or none; `place` is its name, read-only. */
  placeId: z.number().int().positive().nullable(),
  place: z.string().nullable(),
});
export type Activity = z.infer<typeof activitySchema>;

/**
 * A program item: what a guest is invited to and answers for (RSVP-02). It has no time or place of
 * its own; its activities, by start, are what the programme shows. It has at least one (RSVP-17).
 */
export const programItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** The Kürzel the tables show (RSVP-23); null: the first letter of the name, see `shortCodeOf`. */
  shortCode: z.string().nullable(),
  /** The program item that has the meal: the menu is asked only for persons attending it. */
  hasMeal: z.boolean(),
  activities: z.array(activitySchema),
});
export type ProgramItem = z.infer<typeof programItemSchema>;

/** A menu option; `forChildren` puts it in the children's list (RSVP-19). */
export const menuOptionSchema = z.object({
  id: idSchema,
  name: z.string(),
  forChildren: z.boolean(),
  /** The Kürzel the tables show (RSVP-23); null: the first letter of the name, see `shortCodeOf`. */
  shortCode: z.string().nullable(),
});
export type MenuOption = z.infer<typeof menuOptionSchema>;

export const activityNameSchema = z.string().trim().min(1).max(60);

/** `POST /api/admin/rsvp/program-items/:id/activities`: an activity; a change names what changes. */
export const activityRequestSchema = z.strictObject({
  name: activityNameSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  placeId: z.number().int().positive().nullable().optional(),
});
export type ActivityRequest = z.infer<typeof activityRequestSchema>;
export const activityUpdateSchema = z
  .strictObject({
    name: activityNameSchema.optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    placeId: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "name at least one value" });
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;

/**
 * `POST /api/admin/rsvp/program-items`: a program item with its activities, at least one (RSVP-17).
 * `PATCH`: a change names what changes; the activities have their own routes.
 */
export const programItemRequestSchema = z.strictObject({
  name: programItemNameSchema,
  shortCode: shortCodeSchema.nullable().optional(),
  hasMeal: z.boolean().optional(),
  /** The activities; at least the first one (RSVP-17). */
  activities: z.array(activityRequestSchema).min(1).max(50),
});
export type ProgramItemRequest = z.infer<typeof programItemRequestSchema>;
export const programItemUpdateSchema = z
  .strictObject({
    name: programItemNameSchema.optional(),
    shortCode: shortCodeSchema.nullable().optional(),
    hasMeal: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "name at least one value" });
export type ProgramItemUpdate = z.infer<typeof programItemUpdateSchema>;

/** `POST /api/admin/rsvp/menus`: a menu of the adults' list (the default) or of the children's list. */
export const menuCreateSchema = z.strictObject({
  name: menuNameSchema,
  shortCode: shortCodeSchema.nullable().optional(),
  forChildren: z.boolean().optional(),
});
export type MenuCreate = z.infer<typeof menuCreateSchema>;

/** `PATCH /api/admin/rsvp/menus/:id`: a menu stays in its list; the name and the Kürzel change. */
export const menuRequestSchema = z.strictObject({
  name: menuNameSchema,
  shortCode: shortCodeSchema.nullable().optional(),
});
export type MenuRequest = z.infer<typeof menuRequestSchema>;

/** `PUT /api/admin/rsvp/deadline`: the last day guests can change the RSVP; null removes it. */
export const deadlineRequestSchema = z.strictObject({ deadline: dateSchema.nullable() });
export type DeadlineRequest = z.infer<typeof deadlineRequestSchema>;

/** `PUT /api/admin/rsvp/song`: switches the song wish on or off. */
export const songEnabledRequestSchema = z.strictObject({ enabled: z.boolean() });

/** `PUT /api/admin/rsvp/per-item`: one answer per person (off) or yes or no per program item (on). */
export const perItemRequestSchema = z.strictObject({ enabled: z.boolean() });

/** `PUT /api/admin/rsvp/companion-approval`: whether added persons need the admin's approval. */
export const companionApprovalRequestSchema = z.strictObject({ enabled: z.boolean() });

/** `GET /api/admin/rsvp/config`: deadline, program items and menus (Einstellungen › Anmeldung). */
export const rsvpConfigSchema = z.object({
  deadline: dateSchema.nullable(),
  /** Whether the RSVP asks for a song wish (RSVP-06). */
  songEnabled: z.boolean(),
  /** Yes or no per program item (RSVP-11); off: one answer per person for all of them. */
  perItem: z.boolean(),
  /** Whether an added accompanying person waits for the admin's approval (RSVP-12). */
  companionApproval: z.boolean(),
  /** Requests waiting for a decision: shown when switching the approval off. */
  pendingCount: z.number().int(),
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
  personType: personTypeSchema,
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
  /** The guest must choose it, there is no default (RSVP-13). */
  personType: personTypeSchema,
  note: companionNoteSchema.nullable().optional(),
  ...personAnswerShape,
});
export type CompanionRequest = z.infer<typeof companionRequestSchema>;

/** `PATCH /api/admin/rsvp/companions/:id`: the name and the type of a person, by the admin (7.4.1, RSVP-13). */
export const companionRenameSchema = z
  .strictObject({ name: companionNameSchema.optional(), personType: personTypeSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, { message: "name at least one value" });

/** The answer of one person: attendance per invited program item, menu, allergies. */
export const attendanceSchema = z.object({ programItemId: idSchema, attending: z.boolean() });

/** `PUT /api/rsvp`, and the admin's change of a guest's RSVP (RSVP-01, RSVP-03, RSVP-06). */
export const rsvpAnswerRequestSchema = z.strictObject({
  attendance: z.array(attendanceSchema).max(50),
  /** Needed for a person who attends the meal program item while menus exist; ignored otherwise. */
  menuId: idSchema.nullable().optional(),
  allergies: allergiesSchema.nullable().optional(),
  /** Only the main invitee has it, not the companions (RSVP-20). */
  remarks: remarksSchema.nullable().optional(),
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
  remarks: z.string().nullable(),
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
  /** The guest's own type: a child may leave the menu open (RSVP-14). The page does not show it. */
  personType: personTypeSchema,
  /** Yes or no per program item (RSVP-11); off: step 1 asks once per person. */
  perItem: z.boolean(),
  /** Whether an added accompanying person waits for the admin's approval (RSVP-12). */
  companionApproval: z.boolean(),
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

/** The menus a person chooses from: the children's list for a child, the adults' list for everyone else (RSVP-19). */
export function menusFor<T extends { forChildren: boolean }>(
  menus: readonly T[],
  personType: PersonType,
): T[] {
  return menus.filter((menu) => menu.forChildren === (personType === "child"));
}

/**
 * A person attending the program item with the meal is offered a menu, as long as the person's list
 * has entries (RSVP-03, RSVP-19); `menuCount` is the size of that list.
 */
export function menuOffered(
  programItems: readonly Pick<ProgramItem, "id" | "hasMeal">[],
  menuCount: number,
  attendingItemIds: readonly number[],
): boolean {
  const meal = programItems.find((programItem) => programItem.hasMeal);
  return meal !== undefined && menuCount > 0 && attendingItemIds.includes(meal.id);
}

/** A person must choose the menu that is offered, adult or child (RSVP-14, RSVP-19). */
export function menuRequired(
  programItems: readonly Pick<ProgramItem, "id" | "hasMeal">[],
  menuCount: number,
  attendingItemIds: readonly number[],
): boolean {
  return menuOffered(programItems, menuCount, attendingItemIds);
}

/** One row of the guest table (RSVP-04, RSVP-05); `allergies` is for admins only (SEC-11). */
export const rsvpGuestSchema = z.object({
  userId: idSchema,
  name: z.string(),
  personType: personTypeSchema,
  status: z.enum(RSVP_STATUSES),
  invitedProgramItemIds: z.array(idSchema),
  attendingItemIds: z.array(idSchema),
  /** The program items answered with no; an invited program item in neither list is not answered yet. */
  declinedItemIds: z.array(idSchema),
  menuId: idSchema.nullable(),
  songWish: z.string().nullable(),
  allergies: z.string().nullable(),
  /** "Sonstiges/Anmerkungen" (RSVP-20); admins only like the allergies. */
  remarks: z.string().nullable(),
  /** True if a reminder can reach the guest: an active account with a verified email address. */
  verifiedEmail: z.boolean(),
  /** The email address: confirmed, not confirmed yet ("offen") or none (RSVP-22). */
  emailState: z.enum(["verified", "open", "none"]),
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
  /** Yes or no per program item (RSVP-11); off: the totals are one bar for everyone. */
  perItem: z.boolean(),
  /** Whether an added accompanying person waits for the admin's approval (RSVP-12). */
  companionApproval: z.boolean(),
  programItems: z.array(programItemSchema),
  menus: z.array(menuOptionSchema),
  /** Per program item: persons who answered yes and who answered no; a program item not answered yet counts in neither. */
  totals: z.array(
    z.object({
      programItemId: idSchema,
      yes: z.number().int(),
      no: z.number().int(),
      /** The yes split by person type (RSVP-15). */
      yesByType: z.object({
        adult: z.number().int(),
        child: z.number().int(),
      }),
    }),
  ),
  /**
   * Per person, for the single bar while guests answer once (RSVP-11 off, RSVP-15): yes for whoever
   * attends at least one program item, no for whoever declined every program item they are invited to.
   */
  personTotals: z.object({
    yes: z.number().int(),
    no: z.number().int(),
    yesByType: z.object({ adult: z.number().int(), child: z.number().int() }),
  }),
  /** Menu choices of the persons attending the meal program item; menuId null = no choice made. */
  menuTotals: z.array(
    z.object({
      menuId: idSchema.nullable(),
      count: z.number().int(),
      /** How many of them are children; of an adults' menu these are "Erwachsenenmenü" choices (RSVP-19). */
      childCount: z.number().int(),
    }),
  ),
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
export const rsvpPendingSchema = z.object({
  pendingCount: z.number().int(),
  /** The badge and the tile "Begleitpersonen" show only while approval is on (RSVP-12). */
  companionApproval: z.boolean(),
});

/** `GET /api/admin/rsvp/guests/:id`: the wizard in admin mode (deadline ignored). */
export const rsvpAdminStateSchema = rsvpStateSchema;

/** `PUT /api/admin/users/:id/program-items`: the program items a guest is invited to. */
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
  "rsvp.per_item",
  "rsvp.companion_approval",
  "waiting.set",
  "platform.open",
  "platform.close",
  "privacy.set",
  "rsvp.program_item.create",
  "rsvp.program_item.update",
  "rsvp.program_item.delete",
  "rsvp.activity.create",
  "rsvp.activity.update",
  "rsvp.activity.delete",
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
  "companion.remove",
  "event.setup",
  "event.set",
  "feature.set",
  "setting.set",
  "content.page.create",
  "content.page.update",
  "content.page.delete",
  "content.pages.order",
  "content.start.set",
  "content.place.create",
  "content.place.update",
  "content.place.delete",
  "content.image.upload",
  "content.image.delete",
  "theme.import",
  "theme.reset",
  "world.import",
  "world.rollback",
  "world.action",
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
