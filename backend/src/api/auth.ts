// Sign-in, sessions, profile and password routes (ACC-01, ACC-04, ACC-05, ACC-08,
// ACC-13, SEC-01, SEC-02; sw-architecture.md 7.1.1).
import { timingSafeEqual } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import {
  createUserRequestSchema,
  createUserResponseSchema,
  loginRequestSchema,
  passwordChangeSchema,
  passwordSetSchema,
  profileUpdateSchema,
  sessionResponseSchema,
  userSchema,
} from "@zappaloo/shared";
import type { Role, User } from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AccountError } from "../auth/accounts.ts";
import type { AccountService } from "../auth/accounts.ts";
import {
  LOGIN_FAILURES_PER_USER,
  LOGIN_PER_ADDRESS,
  PASSWORD_SET_PER_ADDRESS,
} from "../auth/rate-limit.ts";
import type { RateLimiter } from "../auth/rate-limit.ts";
import type { SessionService } from "../auth/sessions.ts";
import type { EventService } from "../event/service.ts";
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
}

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
function signedIn(request: FastifyRequest): AuthState {
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

function rateLimited(reply: FastifyReply, retryAfter: number): FastifyReply {
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
      const user = session && accounts.getUser(session.userId);
      if (session && user) {
        request.auth = { user, token: unsigned.value, csrfToken: session.csrfToken };
        if (session.renewed) {
          reply.setCookie(SESSION_COOKIE, unsigned.value, cookieOptions(session.expiresAt));
        }
      } else if (unsigned.value) {
        sessions.destroy(unsigned.value);
      }
    }

    if (!UNSAFE_METHODS.has(request.method) || !request.url.startsWith("/api/")) return;
    const origin = originHost(request.headers.origin);
    const refused =
      (origin !== undefined && origin !== request.headers.host) ||
      (request.auth !== null &&
        !sameToken(String(request.headers["x-csrf-token"] ?? ""), request.auth.csrfToken));
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
    { schema: { querystring: noQuery, response: { 200: sessionResponseSchema } } },
    (request) => session(request),
  );

  app.post(
    "/api/session",
    {
      schema: {
        querystring: noQuery,
        body: loginRequestSchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const username = request.body.username.trim().toLowerCase();
      const userKey = `login:user:${username}`;
      const wait =
        limiter.hit(`login:ip:${request.ip}`, LOGIN_PER_ADDRESS) ??
        limiter.blocked(userKey, LOGIN_FAILURES_PER_USER);
      if (wait !== undefined) return rateLimited(reply, wait);

      const user = await accounts.verifyLogin(username, request.body.password);
      if (!user) {
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
        throw error;
      }
      limiter.reset(key);
      sessions.destroyForUser(auth.user.id, auth.token); // other devices sign in again
      return reply.status(204).send();
    },
  );

  // Setting the password with a one-time link (setup or reset); works once.
  app.post(
    "/api/password/set",
    { schema: { querystring: noQuery, body: passwordSetSchema } },
    async (request, reply) => {
      const wait = limiter.hit(`password-set:ip:${request.ip}`, PASSWORD_SET_PER_ADDRESS);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        const user = await accounts.useLink(request.body.token, request.body.newPassword);
        sessions.destroyForUser(user.id);
      } catch (error) {
        if (error instanceof AccountError && error.code === "invalid_link") {
          return sendError(reply, 400, { code: "invalid_link", message: error.message });
        }
        throw error;
      }
      return reply.status(204).send();
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
      try {
        const user = accounts.createUser(request.body, actor);
        const link = accounts.createLink(user.id, "setup", actor);
        return await reply.status(201).send({
          user,
          setupUrl: setPasswordUrl(options.publicUrl, link.token),
          expiresAt: link.expiresAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof AccountError && error.code === "username_taken") {
          return sendError(reply, 409, { code: "username_taken", message: error.message });
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
