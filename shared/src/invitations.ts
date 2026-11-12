// Personal invitations (sw-architecture.md 9): the schemas of the invitation API.
import { z } from "zod";
import { personTypeSchema } from "./rsvp.ts";
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  usernameSchema,
  userSchema,
} from "./account.ts";

/** What an admin sees of a code; `expired` is derived from the expiry date (INV-06). */
export const INVITATION_STATUSES = [
  "active",
  "redeemed",
  "expired",
  "revoked",
  "replaced",
] as const;
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const invitationSchema = z.object({
  id: z.number().int(),
  guestName: z.string(),
  note: z.string().nullable(),
  status: invitationStatusSchema,
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  redeemedAt: z.string().nullable(),
  /** The account that redeemed the code, while it exists. */
  redeemedBy: z.number().int().nullable(),
  /** The program items the guest is invited to (RSVP-02), those of the guest's account. */
  programItemIds: z.array(z.number().int()),
  /** The guest's person type (RSVP-13): the account's, the guest never sees it. */
  personType: personTypeSchema,
  /** The invited person's account (ACC-17); null for old revoked and replaced codes. */
  userId: z.number().int().nullable(),
  /**
   * True if revoking this code also removes the guest: it is the account's last open code and the
   * account was never activated (INV-20). The button then asks for a second click.
   */
  removesGuest: z.boolean(),
});
export type Invitation = z.infer<typeof invitationSchema>;
export const invitationListSchema = z.object({ invitations: z.array(invitationSchema) });

/** A freshly created or regenerated invitation: the only time the plain code exists (INV-14). */
export const issuedInvitationSchema = invitationSchema.extend({
  /** Six characters, e.g. K7QMX4. */
  code: z.string(),
  /** The personal link that the QR code on the card holds. */
  url: z.string(),
});
export type IssuedInvitation = z.infer<typeof issuedInvitationSchema>;

/** `POST /api/admin/invitations` (INV-01, INV-04): one invitation per guest. */
export const createInvitationsRequestSchema = z.strictObject({
  guests: z
    .array(
      z.strictObject({
        name: displayNameSchema,
        note: z.string().trim().min(1).max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
  /** ISO date-time; without it the codes do not expire. */
  expiresAt: z.iso.datetime().optional(),
  /** The program items all these guests are invited to; without it, every program item (RSVP-02). */
  programItemIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
  /** The person type of all these guests (RSVP-13); without it, adult. */
  personType: personTypeSchema.optional(),
});
export type CreateInvitationsRequest = z.infer<typeof createInvitationsRequestSchema>;
export const createInvitationsResponseSchema = z.object({
  invitations: z.array(issuedInvitationSchema),
});

/** `GET /api/invitations/:code`: what a guest sees before redeeming. */
export const invitationPreviewSchema = z.object({ guestName: z.string() });
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** `POST /api/invitations/:code/register`: a new account (INV-07, case 1). */
export const registerRequestSchema = z.strictObject({
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
  password: passwordSchema,
  /** Optional: for news and a forgotten password; verified later in the profile (7.1.1). */
  email: emailSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** `POST /api/admin/invitations/:id/revoke`: the code, and whether the guest was removed with it (INV-20). */
export const revokeResponseSchema = invitationSchema.extend({ guestRemoved: z.boolean() });
export type RevokeResponse = z.infer<typeof revokeResponseSchema>;

/** The user whose account redeemed the code. */
export const redeemResponseSchema = z.object({ user: userSchema });
