// Role changes, staff capabilities and guest groups (sw-architecture.md 8, 12): the
// schemas of the admin API.
import { z } from "zod";
import { capabilitySchema, roleSchema, userSchema } from "./account.ts";
import { personTypeSchema } from "./rsvp.ts";

/** `PUT /api/admin/users/:id/roles`: the complete set of roles of the user (ROLE-01). */
export const setRolesRequestSchema = z.strictObject({ roles: z.array(roleSchema).max(3) });
export type SetRolesRequest = z.infer<typeof setRolesRequestSchema>;

/** `PUT /api/admin/users/:id/capabilities`: the complete set of capabilities (ROLE-06). */
export const setCapabilitiesRequestSchema = z.strictObject({
  capabilities: z.array(capabilitySchema).max(10),
});
export type SetCapabilitiesRequest = z.infer<typeof setCapabilitiesRequestSchema>;

export const groupNameSchema = z.string().trim().min(1).max(60);
export const groupRequestSchema = z.strictObject({ name: groupNameSchema });
export type GroupRequest = z.infer<typeof groupRequestSchema>;

export const groupSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** The ids of the members. */
  memberIds: z.array(z.number().int()),
});
export type Group = z.infer<typeof groupSchema>;

export const groupListSchema = z.object({ groups: z.array(groupSchema) });

/** `GET /api/admin/users`: every account of the event with its groups. */
export const USER_STATUSES = ["inactive", "active", "blocked"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const adminUserSchema = userSchema.extend({
  /** Null while the account is inactive and was created for an invitation (ACC-17, 7.1.2). */
  username: z.string().nullable(),
  /** The person type of a guest (RSVP-13). */
  personType: personTypeSchema,
  /** `inactive`: never activated; `active`; `blocked` by an admin (ACC-18). */
  status: userStatusSchema,
  /** How `vip` was granted (INV-11); null without the role. */
  vipAssignment: z.enum(["invitation_code", "admin_promotion"]).nullable(),
  groups: z.array(z.object({ id: z.number().int(), name: z.string() })),
  /** The program items a `vip` is invited to (RSVP-02); empty without the role. */
  invitedProgramItemIds: z.array(z.number().int()),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUserListSchema = z.object({ users: z.array(adminUserSchema) });
