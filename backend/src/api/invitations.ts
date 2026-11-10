// Personal invitations: the admin manages them (INV-01, INV-04, INV-05, INV-14), guests look
// up and redeem a code (INV-03, INV-07, INV-12; sw-architecture.md 9).
import fp from "fastify-plugin";
import { z } from "zod";
import {
  createInvitationsRequestSchema,
  createInvitationsResponseSchema,
  invitationListSchema,
  invitationPreviewSchema,
  invitationSchema,
  issuedInvitationSchema,
  redeemResponseSchema,
  registerRequestSchema,
} from "@zappaloo/shared";
import type { IssuedInvitation } from "@zappaloo/shared";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AccountError } from "../auth/accounts.ts";
import { InvitationError, normalizeCode } from "../auth/invitations.ts";
import type { IssuedCode } from "../auth/invitations.ts";
import {
  REDEEM_FAILURES_GLOBAL,
  REDEEM_GLOBAL_KEY,
  REDEEM_PER_ADDRESS,
} from "../auth/rate-limit.ts";
import type { RateLimiter } from "../auth/rate-limit.ts";
import { rateLimited, requireRole, requireUser, signedIn } from "./auth.ts";
import type { AuthOptions } from "./auth.ts";
import { sendError } from "./validation.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();
const idParams = z.strictObject({ id: z.coerce.number().int().positive() });
const codeParams = z.strictObject({ code: z.string().min(1).max(40) });

const STATUSES: Partial<Record<string, number>> = {
  invalid_invitation: 404,
  invitation_not_found: 404,
  invitation_expired: 410,
  invitation_redeemed: 410,
  invitation_revoked: 410,
  invitation_replaced: 410,
  already_vip: 409,
  not_regenerable: 409,
  not_revocable: 409,
};

function fail(reply: FastifyReply, error: unknown, limiter?: RateLimiter): FastifyReply {
  if (error instanceof InvitationError) {
    // A wrong code, or one that is used up, counts against everyone (a guesser has many addresses).
    if (limiter && error.code !== "already_vip")
      limiter.hit(REDEEM_GLOBAL_KEY, REDEEM_FAILURES_GLOBAL);
    const status = STATUSES[error.code];
    if (status !== undefined) {
      return sendError(reply, status, { code: error.code, message: error.message });
    }
  }
  throw error;
}

const invitationPlugin: FastifyPluginAsyncZod<AuthOptions> = (app, options) => {
  const { invitations, limiter, publicUrl } = options;
  /** Seconds to wait if this address or all addresses together tried too often. */
  const redeemWait = (ip: string) =>
    limiter.hit(`redeem:ip:${ip}`, REDEEM_PER_ADDRESS) ??
    limiter.blocked(REDEEM_GLOBAL_KEY, REDEEM_FAILURES_GLOBAL);
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  /** The plain code and the link of the card, which exist only in this response (INV-14). */
  const issued = ({ invitation, code }: IssuedCode): IssuedInvitation => ({
    ...invitation,
    code,
    url: `${publicUrl.replace(/\/+$/, "")}/invite/${normalizeCode(code) ?? code}`,
  });

  app.get(
    "/api/admin/invitations",
    { ...admin, schema: { querystring: noQuery, response: { 200: invitationListSchema } } },
    () => ({ invitations: invitations.list() }),
  );

  app.post(
    "/api/admin/invitations",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: createInvitationsRequestSchema,
        response: { 201: createInvitationsResponseSchema },
      },
    },
    async (request, reply) => {
      const { guests, expiresAt } = request.body;
      if (expiresAt !== undefined && new Date(expiresAt) <= new Date()) {
        return sendError(reply, 400, {
          code: "validation_failed",
          message: "The expiry date must be in the future.",
        });
      }
      const created = invitations.create(
        guests,
        expiresAt === undefined ? undefined : new Date(expiresAt),
        actor(request),
      );
      return reply.status(201).send({ invitations: created.map(issued) });
    },
  );

  app.post(
    "/api/admin/invitations/:id/revoke",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: noBody,
        response: { 200: invitationSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(invitations.revoke(request.params.id, actor(request)));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.post(
    "/api/admin/invitations/:id/regenerate",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: z.strictObject({ expiresAt: z.iso.datetime().optional() }).nullish(),
        response: { 201: issuedInvitationSchema },
      },
    },
    async (request, reply) => {
      try {
        const expiresAt = request.body?.expiresAt;
        const code = invitations.regenerate(
          request.params.id,
          expiresAt === undefined ? undefined : new Date(expiresAt),
          actor(request),
        );
        return await reply.status(201).send(issued(code));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Guests: look a code up before redeeming it, so the page can greet by name.
  app.get(
    "/api/invitations/:code",
    {
      schema: {
        querystring: noQuery,
        params: codeParams,
        response: { 200: invitationPreviewSchema },
      },
    },
    async (request, reply) => {
      const wait = redeemWait(request.ip);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        return await reply.send(invitations.preview(request.params.code));
      } catch (error) {
        return fail(reply, error, limiter);
      }
    },
  );

  // A new guest registers and redeems the code in one step (INV-07).
  app.post(
    "/api/invitations/:code/register",
    {
      schema: {
        querystring: noQuery,
        params: codeParams,
        body: registerRequestSchema,
        response: { 201: redeemResponseSchema },
      },
    },
    async (request, reply) => {
      const wait = redeemWait(request.ip);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        const user = await invitations.redeemWithNewAccount(request.params.code, request.body);
        return await reply.status(201).send({ user });
      } catch (error) {
        if (error instanceof AccountError && error.code === "username_taken") {
          return sendError(reply, 409, { code: "username_taken", message: error.message });
        }
        return fail(reply, error, limiter);
      }
    },
  );

  // A signed-in user without vip redeems the code and keeps their account (INV-07, ACC-07).
  app.post(
    "/api/invitations/:code/redeem",
    {
      preHandler: requireUser,
      schema: {
        querystring: noQuery,
        params: codeParams,
        body: noBody,
        response: { 200: redeemResponseSchema },
      },
    },
    async (request, reply) => {
      const wait = redeemWait(request.ip);
      if (wait !== undefined) return rateLimited(reply, wait);
      try {
        const user = invitations.redeemForUser(request.params.code, signedIn(request).user.id);
        return await reply.send({ user });
      } catch (error) {
        return fail(reply, error, limiter);
      }
    },
  );

  return Promise.resolve();
};

export const invitationRoutes = fp(invitationPlugin, { name: "invitations" });
