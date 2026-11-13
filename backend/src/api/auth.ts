// Sign-in, sessions, profile and password routes (ACC-01, ACC-04, ACC-05, ACC-08,
// ACC-13, SEC-01, SEC-02; sw-architecture.md 7.1.1).
import { timingSafeEqual } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import {
  accountDeleteSchema,
  createUserRequestSchema,
  createUserResponseSchema,
  emailVerifySchema,
  forgotPasswordSchema,
  loginRequestSchema,
  passwordChangeSchema,
  passwordLinkResponseSchema,
  passwordSetSchema,
  profileUpdateSchema,
  resetLinkResponseSchema,
  sessionResponseSchema,
  userSchema,
} from "@zappaloo/shared";
import type { Capability, Role, User } from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AccountError, LINK_VALIDITY_MS } from "../auth/accounts.ts";
import { ANONYMOUS_ACTOR } from "../event/service.ts";
import type { AccountService } from "../auth/accounts.ts";
import {
  EMAIL_VERIFY_FAILURES_PER_ADDRESS,
  FORGOT_PER_ADDRESS,
  LOGIN_FAILURES_PER_ADDRESS,
  LOGIN_FAILURES_PER_USER,
  PASSWORD_SET_FAILURES_PER_ADDRESS,
  RESET_MAILS_PER_ACCOUNT,
  VERIFY_MAIL_PER_USER,
} from "../auth/rate-limit.ts";
import type { RateLimiter } from "../auth/rate-limit.ts";
import type { AccessService } from "../auth/access.ts";
import type { GroupService } from "../auth/groups.ts";
import type { InvitationService } from "../auth/invitations.ts";
import type { ActivityService } from "../event/activity.ts";
import type { RsvpService } from "../rsvp/service.ts";
import type { WaitingService } from "../waiting/service.ts";
import type { FooterService } from "../event/footer.ts";
import type { PlatformService } from "../event/platform.ts";
import type { SessionService } from "../auth/sessions.ts";
import type { EventService } from "../event/service.ts";
import type { Mailer } from "../mail/mailer.ts";
import { passwordResetMail, verificationMail } from "../mail/templates.ts";
import { isApiRequest, needsSignIn, PUBLIC } from "./access.ts";
import { sendError } from "./validation.ts";

export const SESSION_COOKIE = "zappaloo_session";

export interface AuthOptions {
  accounts: AccountService;
  sessions: SessionService;
  limiter: RateLimiter;
  event: EventService;
  /** Signs the session cookie. */
  secret: string;
  /** Cookie only over HTTPS (staging, prod). */
  secureCookies: boolean;
  /** Address of the site, for the links handed out. */
  publicUrl: string;
  /** Guest groups (GRP-01). */
  groups: GroupService;
  /** Access conditions and manual releases (ACS-05, ACS-06). */
  access: AccessService;
  /** Personal invitation codes (INV-01 – INV-12). */
  invitations: InvitationService;
  /** The RSVP, program items and menus (RSVP-01 – RSVP-07). */
  rsvp: RsvpService;
  /** Opening and closing the platform, and the privacy notice (ACS-14, SEC-09). */
  platform: PlatformService;
  /** The waiting page of a closed platform (ACS-10 – ACS-13). */
  waiting: WaitingService;
  /** The footer: copyright line, repository address, license text (LIC-01 – LIC-03). */
  footer: FooterService;
  /** The latest changes for the admin overview (DATA-05). */
  activity: ActivityService;
  /** Sends emails (ACC-11); undefined if no mail server is configured. */
  mailer?: Mailer | undefined;
}

const LINK_VALIDITY_HOURS = LINK_VALIDITY_MS / 3_600_000;

/** The signed-in user of a request; null without a valid session. */
export interface AuthState {
  user: User;
  /** The session token from the cookie. */
  token: string;
  csrfToken: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthState | null;
  }
}

/**
 * What a signed-in guest can call while the platform is closed (ACS-10): sign-in and account,
 * RSVP, the waiting page, the event, system routes and invitation redemption. Everything else
 * under /api that a later feature adds is closed by default. Admin routes keep their own role check.
 */
export const OPEN_WHILE_CLOSED = [
  "/api/session",
  "/api/password",
  "/api/email",
  "/api/profile",
  "/api/rsvp",
  "/api/waiting",
  "/api/privacy",
  "/api/license",
  "/api/site",
  "/api/event",
  // The live channel only answers its ping while closed; the game world's feeds stay closed.
  "/api/events/ping",
  "/api/health",
  "/api/version",
  "/api/invitations",
  // Every admin route checks the admin role itself; capabilities belong to staff, who pass.
  "/api/admin",
];

/** The route is an entry of the list or below it: `/api/profile/password`, not `/api/profiles`. */
function openWhileClosed(route: string): boolean {
  return OPEN_WHILE_CLOSED.some((entry) => route === entry || route.startsWith(`${entry}/`));
}

/** True if the request is refused because the platform is closed for this user (ACS-10). */
function closedFor(user: User, request: FastifyRequest, event: EventService): boolean {
  const route = request.routeOptions.url ?? "";
  // Unknown paths and the frontend's files are not the API's business (404, static files).
  if (!route.startsWith("/api/")) return false;
  if (openWhileClosed(route)) return false;
  if (user.roles.includes("staff") || user.roles.includes("admin")) return false;
  return !event.get().settings.platformOpen;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const noQuery = z.strictObject({});

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Host of the Origin header, or undefined if there is none or it is not a URL. */
function originHost(origin: string | undefined): string | undefined | null {
  if (origin === undefined) return undefined;
  try {
    return new URL(origin).host;
  } catch {
    return null; // "null" or garbage: never matches
  }
}

/** The signed-in user of a request that passed `requireUser` or `requireRole`. */
export function signedIn(request: FastifyRequest): AuthState {
  if (!request.auth) throw new Error("no signed-in user: the route needs requireUser");
  return request.auth;
}

/** `preHandler`: 401 unless a user is signed in. */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (request.auth) return undefined;
  return sendError(reply, 401, { code: "unauthorized", message: "Sign in first." });
}

/** `preHandler`: 401 unless signed in, 403 unless the user has the role in the event. */
export function requireRole(role: Role) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> => {
    if (!request.auth) {
      return sendError(reply, 401, { code: "unauthorized", message: "Sign in first." });
    }
    if (!request.auth.user.roles.includes(role)) {
      return sendError(reply, 403, {
        code: "forbidden",
        message: `The role "${role}" is required.`,
      });
    }
    return undefined;
  };
}

/**
 * `preHandler`: 401 unless signed in, 403 unless the user is an admin (ROLE-07) or staff with the
 * capability `editWebsiteContent` (ROLE-06). Used by the content editor (sw-architecture.md 6.2).
 */
export async function requireContentEditor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (!request.auth) {
    return sendError(reply, 401, { code: "unauthorized", message: "Sign in first." });
  }
  const { roles, capabilities } = request.auth.user;
  if (roles.includes("admin")) return undefined;
  if (roles.includes("staff") && capabilities.includes("editWebsiteContent")) return undefined;
  return sendError(reply, 403, {
    code: "forbidden",
    message: 'The capability "editWebsiteContent" is required.',
  });
}

/**
 * `preHandler`: 401 unless signed in, 403 unless the user is staff with the capability (ROLE-06).
 * An admin does not pass without being staff with it (ROLE-08).
 */
export function requireCapability(capability: Capability) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> => {
    if (!request.auth) {
      return sendError(reply, 401, { code: "unauthorized", message: "Sign in first." });
    }
    const { roles, capabilities } = request.auth.user;
    if (!roles.includes("staff") || !capabilities.includes(capability)) {
      return sendError(reply, 403, {
        code: "forbidden",
        message: `The capability "${capability}" is required.`,
      });
    }
    return undefined;
  };
}

export function rateLimited(reply: FastifyReply, retryAfter: number): FastifyReply {
  return sendError(reply.header("retry-after", String(retryAfter)), 429, {
    code: "rate_limited",
    message: "Too many attempts. Try again later.",
  });
}

const authPlugin: FastifyPluginAsyncZod<AuthOptions> = async (app, options) => {
  const { accounts, sessions, limiter } = options;
  await app.register(fastifyCookie, { secret: options.secret });
  app.decorateRequest("auth", null);

  const cookieOptions = (expiresAt: Date) => ({
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.secureCookies,
    signed: true,
    expires: expiresAt,
  });

  // Session, then CSRF protection (SEC-01): the Origin must be this site, and a
  // signed-in request must carry the session's CSRF token.
  app.addHook("onRequest", async (request, reply) => {
    const cookie = request.cookies[SESSION_COOKIE];
    const unsigned = cookie ? request.unsignCookie(cookie) : undefined;
    if (unsigned?.valid && unsigned.value) {
      const session = sessions.resolve(unsigned.value);
      const user = session && accounts.getSessionUser(session.userId);
      if (session && user) {
        request.auth = { user, token: unsigned.value, csrfToken: session.csrfToken };
        if (session.renewed) {
          reply.setCookie(SESSION_COOKIE, unsigned.value, cookieOptions(session.expiresAt));
        }
      } else if (unsigned.value) {
        sessions.destroy(unsigned.value);
      }
    }

    // Sign-in is required everywhere except the public routes (ACS-09, ACS-07).
    if (!request.auth && needsSignIn(request)) {
      return sendError(reply, 401, { code: "unauthorized", message: "Sign in first." });
    }

    // While the platform is closed, guests reach only the waiting page, the RSVP, their profile
    // and the public pages (ACS-10, ACS-07); staff and admins reach everything.
    if (request.auth && closedFor(request.auth.user, request, options.event)) {
      return sendError(reply, 403, {
        code: "platform_closed",
        message: "The platform is not open yet.",
      });
    }

    if (!UNSAFE_METHODS.has(request.method) || !isApiRequest(request)) return;
    const origin = originHost(request.headers.origin);
    // A public route does not rely on the session cookie (a link's token or a code in the body
    // proves the right, or nothing is proved at all), so a signed-in visitor who opens a link
    // from an email needs no CSRF token there; the Origin check still applies to every route.
    const csrfToken =
      request.routeOptions.config.public === true ? undefined : request.auth?.csrfToken;
    const refused =
      (origin !== undefined && origin !== request.headers.host) ||
      (csrfToken !== undefined &&
        !sameToken(String(request.headers["x-csrf-token"] ?? ""), csrfToken));
    if (refused) {
      return sendError(reply, 403, {
        code: "csrf_failed",
        message: "The request was refused (CSRF protection).",
      });
    }
    return undefined;
  });

  const session = (request: FastifyRequest) => ({
    user: request.auth?.user ?? null,
    csrfToken: request.auth?.csrfToken ?? null,
  });

  app.get(
    "/api/session",
    {
      config: PUBLIC,
      schema: { querystring: noQuery, response: { 200: sessionResponseSchema } },
    },
    (request) => session(request),
  );

  app.post(
    "/api/session",
    {
      config: PUBLIC,
      schema: {
        querystring: noQuery,
        body: loginRequestSchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      // "username" holds a username or a verified email address (ACC-16).
      const username = request.body.username.trim().toLowerCase();
      // One lockout per account, whether it is named by username or by email address.
      const userKey = `login:${accounts.loginKey(username)}`;
      const addressKey = `login:ip:${request.ip}`;
      // Only failures count, so guests sharing one address are not blocked by each other.
      const wait =
        limiter.blocked(addressKey, LOGIN_FAILURES_PER_ADDRESS) ??
        limiter.blocked(userKey, LOGIN_FAILURES_PER_USER);
      if (wait !== undefined) return rateLimited(reply, wait);

      const user = await accounts.verifyLogin(username, request.body.password);
      if (!user) {
        limiter.hit(addressKey, LOGIN_FAILURES_PER_ADDRESS);
        limiter.hit(userKey, LOGIN_FAILURES_PER_USER);
        return sendError(reply, 401, {
          code: "invalid_credentials",
          message: "Username or password is wrong.",
        });
      }
      limiter.reset(userKey);
      if (request.auth) sessions.destroy(request.auth.token);
      const started = sessions.create(user.id);
      reply.setCookie(SESSION_COOKIE, started.token, cookieOptions(started.expiresAt));
      return { user, csrfToken: started.csrfToken };
    },
  );

  app.delete(
    "/api/session",
    { preHandler: requireUser, schema: { querystring: noQuery, body: z.null().optional() } },
    (request, reply) => {
      if (request.auth) sessions.destroy(request.auth.token);
      return reply.clearCookie(SESSION_COOKIE, { path: "/" }).status(204).send();
    },
  );

  app.get(
    "/api/profile",
    {
      preHandler: requireUser,
      schema: { querystring: noQuery, response: { 200: userSchema } },
    },
    (request) => signedIn(request).user,
  );

  app.patch(
    "/api/profile",
    {
      preHandler: requireUser,
      schema: { querystring: noQuery, body: profileUpdateSchema, response: { 200: userSchema } },
    },
    (request) => accounts.updateProfile(signedIn(request).user.id, request.body),
  );

  app.post(
    "/api/profile/password",
    { preHandler: requireUser, schema: { querystring: noQuery, body: passwordChangeSchema } },
    async (request, reply) => {
      const auth = signedIn(request);
      const key = `password-change:${String(auth.user.id)}`;
      const wait = limiter.blocked(key, LOGIN_FAILURES_PER_USER);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        await accounts.changePassword(
          auth.user.id,
          request.body.currentPassword,
          request.body.newPassword,
        );
      } catch (error) {
        if (error instanceof AccountError && error.code === "invalid_password") {
          limiter.hit(key, LOGIN_FAILURES_PER_USER);
          return sendError(reply, 400, { code: "invalid_password", message: error.message });
        }
        if (error instanceof AccountError && error.code === "password_is_username") {
          return sendError(reply, 400, { code: "password_is_username", message: error.message });
        }
        throw error;
      }
      limiter.reset(key);
      sessions.destroyForUser(auth.user.id, auth.token); // other devices sign in again
      return reply.status(204).send();
    },
  );

  // What a setup or reset link is for, before the password is typed. Looking up dead links counts
  // against the same limit as setting the password with one.
  app.get(
    "/api/password/link/:token",
    {
      config: PUBLIC,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ token: z.string().min(10).max(200) }),
        response: { 200: passwordLinkResponseSchema },
      },
    },
    async (request, reply) => {
      const key = `password-set:ip:${request.ip}`;
      const wait = limiter.blocked(key, PASSWORD_SET_FAILURES_PER_ADDRESS);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        return await reply.send(accounts.previewLink(request.params.token));
      } catch (error) {
        if (error instanceof AccountError && error.code === "invalid_link") {
          limiter.hit(key, PASSWORD_SET_FAILURES_PER_ADDRESS);
          return sendError(reply, 400, { code: "invalid_link", message: error.message });
        }
        throw error;
      }
    },
  );

  // Setting the password with a one-time link (setup or reset); works once.
  app.post(
    "/api/password/set",
    { config: PUBLIC, schema: { querystring: noQuery, body: passwordSetSchema } },
    async (request, reply) => {
      const key = `password-set:ip:${request.ip}`;
      const wait = limiter.blocked(key, PASSWORD_SET_FAILURES_PER_ADDRESS);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        const user = await accounts.useLink(request.body.token, request.body.newPassword);
        sessions.destroyForUser(user.id);
      } catch (error) {
        if (error instanceof AccountError && error.code === "invalid_link") {
          limiter.hit(key, PASSWORD_SET_FAILURES_PER_ADDRESS);
          return sendError(reply, 400, { code: "invalid_link", message: error.message });
        }
        if (error instanceof AccountError && error.code === "password_is_username") {
          return sendError(reply, 400, { code: "password_is_username", message: error.message });
        }
        throw error;
      }
      return reply.status(204).send();
    },
  );

  // Sends a link to confirm the profile's email address (ACC-09).
  app.post(
    "/api/profile/email/verify",
    { preHandler: requireUser, schema: { querystring: noQuery, body: z.null().optional() } },
    async (request, reply) => {
      const auth = signedIn(request);
      if (!options.mailer) {
        return sendError(reply, 503, {
          code: "mail_unavailable",
          message: "This installation cannot send email.",
        });
      }
      const wait = limiter.hit(`verify-mail:${String(auth.user.id)}`, VERIFY_MAIL_PER_USER);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        const { link, email } = accounts.createVerification(auth.user.id);
        const url = `${options.publicUrl.replace(/\/+$/, "")}/verify-email/${link.token}`;
        await options.mailer.send(
          verificationMail(email, options.event.get().name ?? "Zappaloo", url, LINK_VALIDITY_HOURS),
        );
      } catch (error) {
        if (error instanceof AccountError && error.code === "no_email") {
          return sendError(reply, 409, { code: "no_unverified_email", message: error.message });
        }
        request.log.error({ err: error }, "sending the verification email failed");
        return sendError(reply, 502, {
          code: "mail_failed",
          message: "The email could not be sent.",
        });
      }
      return reply.status(204).send();
    },
  );

  // Confirms the address with the link from the email; works once.
  app.post(
    "/api/email/verify",
    { config: PUBLIC, schema: { querystring: noQuery, body: emailVerifySchema } },
    (request, reply) => {
      const key = `email-verify:ip:${request.ip}`;
      const wait = limiter.blocked(key, EMAIL_VERIFY_FAILURES_PER_ADDRESS);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        accounts.verifyEmail(request.body.token);
      } catch (error) {
        if (error instanceof AccountError && error.code === "invalid_link") {
          limiter.hit(key, EMAIL_VERIFY_FAILURES_PER_ADDRESS);
          return sendError(reply, 400, { code: "invalid_link", message: error.message });
        }
        // Someone else has verified this address already (ACC-16).
        if (error instanceof AccountError && error.code === "email_taken") {
          return sendError(reply, 409, { code: "email_taken", message: error.message });
        }
        throw error;
      }
      return reply.status(204).send();
    },
  );

  // Forgotten password (ACC-03): a reset link by email, only to a verified address. The
  // answer is always the same, so it does not reveal which accounts or addresses exist.
  app.post(
    "/api/password/forgot",
    { config: PUBLIC, schema: { querystring: noQuery, body: forgotPasswordSchema } },
    (request, reply) => {
      const wait = limiter.hit(`forgot:ip:${request.ip}`, FORGOT_PER_ADDRESS);
      if (wait !== undefined) return rateLimited(reply, wait);
      const { mailer } = options;
      if (mailer) {
        const eventName = options.event.get().name ?? "Zappaloo";
        for (const { user, email } of accounts.findResettable(request.body.identifier)) {
          // Only the mails count: links an admin or the CLI hands out do not use up the quota.
          if (limiter.hit(`reset-mail:${String(user.id)}`, RESET_MAILS_PER_ACCOUNT) !== undefined) {
            continue;
          }
          // Nobody is signed in: the request is anonymous, not the user's own.
          const link = accounts.createLink(user.id, "reset", ANONYMOUS_ACTOR);
          const url = setPasswordUrl(options.publicUrl, link.token);
          // Not awaited: the answer must not depend on whether a mail was sent.
          mailer
            .send(passwordResetMail(email, eventName, user.username, url, LINK_VALIDITY_HOURS))
            .catch((error: unknown) => {
              request.log.error({ err: error }, "sending the reset email failed");
            });
        }
      }
      return reply.status(204).send();
    },
  );

  // Users delete their own account after confirming the password (ACC-12).
  app.delete(
    "/api/profile",
    { preHandler: requireUser, schema: { querystring: noQuery, body: accountDeleteSchema } },
    async (request, reply) => {
      const auth = signedIn(request);
      const key = `password-change:${String(auth.user.id)}`;
      const wait = limiter.blocked(key, LOGIN_FAILURES_PER_USER);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        await accounts.deleteAccount(auth.user.id, request.body.password);
      } catch (error) {
        if (error instanceof AccountError && error.code === "invalid_password") {
          limiter.hit(key, LOGIN_FAILURES_PER_USER);
          return sendError(reply, 400, { code: "invalid_password", message: error.message });
        }
        if (error instanceof AccountError && error.code === "last_admin") {
          return sendError(reply, 409, { code: "last_admin", message: error.message });
        }
        throw error;
      }
      return reply.clearCookie(SESSION_COOKIE, { path: "/" }).status(204).send();
    },
  );

  // An admin creates a one-time link for a user and hands it over: a reset link for an active
  // account (ACC-10), a new setup link for an inactive account an admin created (ACC-20).
  app.post(
    "/api/admin/users/:id/reset-link",
    {
      preHandler: requireRole("admin"),
      schema: {
        querystring: noQuery,
        params: z.strictObject({ id: z.coerce.number().int().positive() }),
        body: z.null().optional(),
        response: { 201: resetLinkResponseSchema },
      },
    },
    async (request, reply) => {
      let link;
      try {
        link = accounts.createAdminLink(
          request.params.id,
          `user:${String(signedIn(request).user.id)}`,
        );
      } catch (error) {
        if (error instanceof AccountError && error.code === "user_not_found") {
          return sendError(reply, 404, { code: error.code, message: "There is no such user." });
        }
        if (error instanceof AccountError && error.code === "not_active") {
          return sendError(reply, 409, { code: error.code, message: error.message });
        }
        throw error;
      }
      return reply.status(201).send({
        resetUrl: setPasswordUrl(options.publicUrl, link.token),
        expiresAt: link.expiresAt.toISOString(),
      });
    },
  );

  // An admin creates an account and hands over its setup link (ACC-08).
  app.post(
    "/api/admin/users",
    {
      preHandler: requireRole("admin"),
      schema: {
        querystring: noQuery,
        body: createUserRequestSchema,
        response: { 201: createUserResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = `user:${String(signedIn(request).user.id)}`;
      // The form of an admin names the program items of a new guest; the CLI invites to all (ACC-20).
      if (request.body.roles.includes("vip") && !request.body.programItemIds?.length) {
        return sendError(reply, 400, {
          code: "program_items_required",
          message: "choose at least one program item",
        });
      }
      try {
        const { user, link } = accounts.createUserWithSetupLink(request.body, actor);
        return await reply.status(201).send({
          user,
          setupUrl: setPasswordUrl(options.publicUrl, link.token),
          expiresAt: link.expiresAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof AccountError && error.code === "username_taken") {
          return sendError(reply, 409, { code: "username_taken", message: error.message });
        }
        if (error instanceof AccountError && error.code === "program_items_required") {
          return sendError(reply, 400, { code: error.code, message: error.message });
        }
        if (error instanceof AccountError && error.code === "program_item_not_found") {
          return sendError(reply, 404, { code: error.code, message: error.message });
        }
        throw error;
      }
    },
  );
};

/** The URL where the owner of a one-time link sets the password. */
export function setPasswordUrl(publicUrl: string, token: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/set-password/${token}`;
}

export const authRoutes = fp(authPlugin, { name: "auth" });
