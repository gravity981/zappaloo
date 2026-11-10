// Administration of the event's features and settings, roles, staff capabilities, guest groups
// and releases (CFG-05, ROLE-01, ROLE-03 – ROLE-09, GRP-01, ACS-05; sw-architecture.md 8, 12,
// 19.3.1). All routes need the admin role of the event.
import fp from "fastify-plugin";
import { z } from "zod";
import {
  adminUserListSchema,
  eventResponseSchema,
  eventUpdateSchema,
  releaseKeySchema,
  releaseListSchema,
  groupListSchema,
  groupRequestSchema,
  groupSchema,
  setCapabilitiesRequestSchema,
  setRolesRequestSchema,
  userSchema,
} from "@zappaloo/shared";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AccountError } from "../auth/accounts.ts";
import { GroupError } from "../auth/groups.ts";
import { requireRole, signedIn } from "./auth.ts";
import type { AuthOptions } from "./auth.ts";
import { sendError } from "./validation.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();
const userParams = z.strictObject({ id: z.coerce.number().int().positive() });
const groupParams = z.strictObject({ id: z.coerce.number().int().positive() });
const memberParams = z.strictObject({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

/** Answers the known account and group errors; rethrows anything else. */
function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AccountError || error instanceof GroupError) {
    const statuses: Partial<Record<string, number>> = {
      user_not_found: 404,
      group_not_found: 404,
      group_name_taken: 409,
      last_admin: 409,
      not_staff: 409,
    };
    const status = statuses[error.code];
    if (status !== undefined)
      return sendError(reply, status, { code: error.code, message: error.message });
  }
  throw error;
}

const adminPlugin: FastifyPluginAsyncZod<AuthOptions> = (
  app,
  { accounts, groups, access, event },
) => {
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  // Feature toggles and settings, changed at runtime without a redeployment (CFG-03, CFG-05).
  app.patch(
    "/api/admin/event",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: eventUpdateSchema,
        response: { 200: eventResponseSchema },
      },
    },
    (request) => event.update(request.body, actor(request)),
  );

  app.get(
    "/api/admin/users",
    { ...admin, schema: { querystring: noQuery, response: { 200: adminUserListSchema } } },
    () => ({ users: accounts.listUsers() }),
  );

  // The complete set of roles: what the admin leaves out is revoked, all others stay (ROLE-09).
  app.put(
    "/api/admin/users/:id/roles",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: userParams,
        body: setRolesRequestSchema,
        response: { 200: userSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(
          accounts.setRoles(request.params.id, request.body.roles, actor(request)),
        );
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/admin/users/:id/capabilities",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: userParams,
        body: setCapabilitiesRequestSchema,
        response: { 200: userSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(
          accounts.setCapabilities(request.params.id, request.body.capabilities, actor(request)),
        );
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.get(
    "/api/admin/groups",
    { ...admin, schema: { querystring: noQuery, response: { 200: groupListSchema } } },
    () => ({ groups: groups.list() }),
  );

  app.post(
    "/api/admin/groups",
    {
      ...admin,
      schema: { querystring: noQuery, body: groupRequestSchema, response: { 201: groupSchema } },
    },
    async (request, reply) => {
      try {
        return await reply.status(201).send(groups.create(request.body.name, actor(request)));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.patch(
    "/api/admin/groups/:id",
    { ...admin, schema: { querystring: noQuery, params: groupParams, body: groupRequestSchema } },
    (request, reply) => {
      try {
        groups.rename(request.params.id, request.body.name, actor(request));
        return reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/admin/groups/:id",
    { ...admin, schema: { querystring: noQuery, params: groupParams, body: noBody } },
    (request, reply) => {
      try {
        groups.delete(request.params.id, actor(request));
        return reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/admin/groups/:id/members/:userId",
    { ...admin, schema: { querystring: noQuery, params: memberParams, body: noBody } },
    (request, reply) => {
      try {
        groups.addMember(request.params.id, request.params.userId, actor(request));
        return reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/admin/groups/:id/members/:userId",
    { ...admin, schema: { querystring: noQuery, params: memberParams, body: noBody } },
    (request, reply) => {
      try {
        groups.removeMember(request.params.id, request.params.userId, actor(request));
        return reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Manual releases (ACS-05): while a key is released, the areas that wait for it are open.
  app.get(
    "/api/admin/releases",
    { ...admin, schema: { querystring: noQuery, response: { 200: releaseListSchema } } },
    () => ({ releases: access.releases() }),
  );

  app.put(
    "/api/admin/releases/:key",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ key: releaseKeySchema }),
        body: noBody,
      },
    },
    (request, reply) => {
      access.release(request.params.key, actor(request));
      return reply.status(204).send();
    },
  );

  app.delete(
    "/api/admin/releases/:key",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ key: releaseKeySchema }),
        body: noBody,
      },
    },
    (request, reply) => {
      access.withdraw(request.params.key, actor(request));
      return reply.status(204).send();
    },
  );

  return Promise.resolve();
};

export const adminRoutes = fp(adminPlugin, { name: "admin" });
