// Accounts, sessions and profiles (sw-architecture.md 7.1.1): the schemas of the
// auth API, shared by backend and frontend.
import { z } from "zod";

export const ROLES = ["vip", "staff", "admin"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Login name: lower case, fixed for the life of the account. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "must be 3-32 characters: a-z, 0-9, dot, underscore, hyphen");
export const displayNameSchema = z.string().trim().min(1).max(100);
export const emailSchema = z.email().max(254);
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `must have at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `must have at most ${String(PASSWORD_MAX_LENGTH)} characters`);

/** The fixed capabilities of a staff member (ROLE-06); there are no others. */
export const CAPABILITIES = ["editWebsiteContent", "moderateContributions"] as const;
export const capabilitySchema = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof capabilitySchema>;

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  emailStatus: z.enum(["unverified", "verified"]),
  /** Roles in the event of this installation. */
  roles: z.array(roleSchema),
  /** Capabilities switched on for a staff member; empty without the `staff` role. */
  capabilities: z.array(capabilitySchema),
});
export type User = z.infer<typeof userSchema>;

/** `GET /api/session`: the signed-in user, or none. */
export const sessionResponseSchema = z.object({
  user: userSchema.nullable(),
  /** Sent as `X-CSRF-Token` with every state-changing request; null without a session. */
  csrfToken: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** `POST /api/session`: `username` is a username or a verified email address (ACC-16). */
export const loginRequestSchema = z.strictObject({
  username: z.string().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const profileUpdateSchema = z.strictObject({
  displayName: displayNameSchema.optional(),
  /** null removes the address. */
  email: emailSchema.nullable().optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type PasswordChange = z.infer<typeof passwordChangeSchema>;

/** `POST /api/password/set`: sets the password with a one-time link. */
export const passwordSetSchema = z.strictObject({
  token: z.string().min(10).max(200),
  newPassword: passwordSchema,
});
export type PasswordSet = z.infer<typeof passwordSetSchema>;

/**
 * `GET /api/password/link/:token`: what the set-password page needs to know about a link that
 * can still be used (a new account's setup link or a reset link).
 */
export const passwordLinkResponseSchema = z.object({
  purpose: z.enum(["setup", "reset"]),
  /** The login name the password is for, shown on the page of a setup link. */
  username: z.string(),
});
export type PasswordLinkResponse = z.infer<typeof passwordLinkResponseSchema>;

/** `POST /api/admin/users` (ACC-08). */
export const createUserRequestSchema = z.strictObject({
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
  roles: z.array(roleSchema).default([]),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const createUserResponseSchema = z.object({
  user: userSchema,
  /** One-time link where the owner sets the password. */
  setupUrl: z.string(),
  expiresAt: z.string(),
});
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

/** `POST /api/password/forgot` (ACC-03): a username or an email address. */
export const forgotPasswordSchema = z.strictObject({
  identifier: z.string().trim().min(1).max(254),
});
export type ForgotPassword = z.infer<typeof forgotPasswordSchema>;

/** `POST /api/email/verify`: confirms the address with the link from the email (ACC-09). */
export const emailVerifySchema = z.strictObject({
  token: z.string().min(10).max(200),
});
export type EmailVerify = z.infer<typeof emailVerifySchema>;

/** `DELETE /api/profile`: deletes the own account after confirming the password (ACC-12). */
export const accountDeleteSchema = z.strictObject({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type AccountDelete = z.infer<typeof accountDeleteSchema>;

/** `POST /api/admin/users/:id/reset-link` (ACC-10). */
export const resetLinkResponseSchema = z.object({
  /** One-time link where the user sets a new password. */
  resetUrl: z.string(),
  expiresAt: z.string(),
});
export type ResetLinkResponse = z.infer<typeof resetLinkResponseSchema>;
