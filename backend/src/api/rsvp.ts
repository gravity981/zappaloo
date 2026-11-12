// RSVP: the guests' wizard, the admin's program items, menus, deadline and overview, reminders,
// the CSV export, and the card "Zuletzt" (RSVP-01 – RSVP-07, SEC-11, DATA-05;
// sw-architecture.md 7.4, 7.4.1).
import fp from "fastify-plugin";
import { z } from "zod";
import {
  activityResponseSchema,
  companionRenameSchema,
  companionRequestSchema,
  deadlineRequestSchema,
  programItemRequestSchema,
  programItemSchema,
  programItemUpdateSchema,
  invitedProgramItemsRequestSchema,
  menuOptionSchema,
  menuRequestSchema,
  remindResponseSchema,
  rsvpAnswerRequestSchema,
  rsvpConfigSchema,
  rsvpOverviewSchema,
  rsvpPendingSchema,
  songEnabledRequestSchema,
  rsvpStateSchema,
} from "@zappaloo/shared";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { RSVP_REMIND_PER_EVENT } from "../auth/rate-limit.ts";
import { RsvpError } from "../rsvp/service.ts";
import { requireFeature } from "./event.ts";
import { rateLimited, requireRole, signedIn } from "./auth.ts";
import type { AuthOptions } from "./auth.ts";
import { sendError } from "./validation.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();
const idParams = z.strictObject({ id: z.coerce.number().int().positive() });

const STATUSES: Record<string, number> = {
  program_item_not_found: 404,
  menu_not_found: 404,
  user_not_found: 404,
  not_a_guest: 409,
  rsvp_closed: 403,
  invalid_attendance: 400,
  menu_required: 400,
  invalid_menu: 400,
  companion_not_found: 404,
  companion_not_editable: 409,
  companion_decided: 409,
  companion_limit: 409,
};

function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof RsvpError) {
    return sendError(reply, STATUSES[error.code] ?? 400, {
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

const rsvpPlugin: FastifyPluginAsyncZod<AuthOptions> = (app, options) => {
  const { rsvp, activity, event, limiter, publicUrl, mailer } = options;
  const admin = { preHandler: requireRole("admin") };
  const feature = requireFeature(event, "rsvp");
  const adminFeature = { preHandler: [requireRole("admin"), feature] };
  const guest = { preHandler: [requireRole("vip"), feature] };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  // --- The guest's wizard -----------------------------------------------------------------
  app.get(
    "/api/rsvp",
    { ...guest, schema: { querystring: noQuery, response: { 200: rsvpStateSchema } } },
    async (request, reply) => {
      try {
        return await reply.send(rsvp.state(signedIn(request).user.id));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/rsvp",
    {
      ...guest,
      schema: {
        querystring: noQuery,
        body: rsvpAnswerRequestSchema,
        response: { 200: rsvpStateSchema },
      },
    },
    async (request, reply) => {
      try {
        const userId = signedIn(request).user.id;
        return await reply.send(rsvp.answer(userId, request.body, actor(request)));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // --- Accompanying persons of the guest (RSVP-08 – RSVP-10) --------------------------------
  app.post(
    "/api/rsvp/companions",
    {
      ...guest,
      schema: {
        querystring: noQuery,
        body: companionRequestSchema,
        response: { 201: rsvpStateSchema },
      },
    },
    async (request, reply) => {
      try {
        const userId = signedIn(request).user.id;
        return await reply
          .status(201)
          .send(rsvp.requestCompanion(userId, request.body, actor(request)));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/rsvp/companions/:id",
    {
      ...guest,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: companionRequestSchema,
        response: { 200: rsvpStateSchema },
      },
    },
    async (request, reply) => {
      try {
        const userId = signedIn(request).user.id;
        return await reply.send(
          rsvp.updateCompanion(userId, request.params.id, request.body, actor(request)),
        );
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/rsvp/companions/:id",
    {
      ...guest,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: noBody,
        response: { 200: rsvpStateSchema },
      },
    },
    async (request, reply) => {
      try {
        const userId = signedIn(request).user.id;
        return await reply.send(rsvp.withdrawCompanion(userId, request.params.id, actor(request)));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // --- The admin decides (RSVP-09) ----------------------------------------------------------
  for (const [path, decision] of [
    ["approve", "approved"],
    ["reject", "rejected"],
  ] as const) {
    app.post(
      `/api/admin/rsvp/companions/:id/${path}`,
      { ...adminFeature, schema: { querystring: noQuery, params: idParams, body: noBody } },
      async (request, reply) => {
        try {
          rsvp.decideCompanion(request.params.id, decision, actor(request));
          return await reply.status(204).send();
        } catch (error) {
          return fail(reply, error);
        }
      },
    );
  }

  app.patch(
    "/api/admin/rsvp/companions/:id",
    {
      ...adminFeature,
      schema: { querystring: noQuery, params: idParams, body: companionRenameSchema },
    },
    async (request, reply) => {
      try {
        rsvp.renameCompanion(request.params.id, request.body.name, actor(request));
        return await reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // --- Einstellungen › Rückmeldung --------------------------------------------------------
  app.get(
    "/api/admin/rsvp/config",
    { ...admin, schema: { querystring: noQuery, response: { 200: rsvpConfigSchema } } },
    () => rsvp.config(),
  );

  app.put(
    "/api/admin/rsvp/deadline",
    { ...admin, schema: { querystring: noQuery, body: deadlineRequestSchema } },
    async (request, reply) => {
      rsvp.setDeadline(request.body.deadline, actor(request));
      return await reply.status(204).send();
    },
  );

  app.put(
    "/api/admin/rsvp/song",
    { ...admin, schema: { querystring: noQuery, body: songEnabledRequestSchema } },
    async (request, reply) => {
      rsvp.setSongEnabled(request.body.enabled, actor(request));
      return await reply.status(204).send();
    },
  );

  app.post(
    "/api/admin/rsvp/program-items",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: programItemRequestSchema,
        response: { 201: programItemSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(rsvp.createProgramItem(request.body, actor(request))),
  );

  app.patch(
    "/api/admin/rsvp/program-items/:id",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: programItemUpdateSchema,
        response: { 200: programItemSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(
          rsvp.updateProgramItem(request.params.id, request.body, actor(request)),
        );
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/admin/rsvp/program-items/:id",
    { ...admin, schema: { querystring: noQuery, params: idParams, body: noBody } },
    async (request, reply) => {
      try {
        rsvp.deleteProgramItem(request.params.id, actor(request));
        return await reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.post(
    "/api/admin/rsvp/menus",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: menuRequestSchema,
        response: { 201: menuOptionSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(rsvp.createMenu(request.body.name, actor(request))),
  );

  app.patch(
    "/api/admin/rsvp/menus/:id",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: menuRequestSchema,
        response: { 200: menuOptionSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(
          rsvp.renameMenu(request.params.id, request.body.name, actor(request)),
        );
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/admin/rsvp/menus/:id",
    { ...admin, schema: { querystring: noQuery, params: idParams, body: noBody } },
    async (request, reply) => {
      try {
        rsvp.deleteMenu(request.params.id, actor(request));
        return await reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // The program items a guest account is invited to (account panel, "Eingeladen zu").
  app.put(
    "/api/admin/users/:id/program-items",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: invitedProgramItemsRequestSchema,
        response: { 200: invitedProgramItemsRequestSchema },
      },
    },
    async (request, reply) => {
      try {
        const programItemIds = rsvp.setInvitedProgramItems(
          request.params.id,
          request.body.programItemIds,
          actor(request),
        );
        return await reply.send({ programItemIds });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // --- Rückmeldungen ----------------------------------------------------------------------
  app.get(
    "/api/admin/rsvp",
    { ...adminFeature, schema: { querystring: noQuery, response: { 200: rsvpOverviewSchema } } },
    () => rsvp.overview(),
  );

  // The badge of the admin navigation: a count, without loading the guest table.
  app.get(
    "/api/admin/rsvp/pending",
    { ...adminFeature, schema: { querystring: noQuery, response: { 200: rsvpPendingSchema } } },
    () => ({ pendingCount: rsvp.pendingCount() }),
  );

  app.get(
    "/api/admin/rsvp/export",
    { ...adminFeature, schema: { querystring: noQuery } },
    (_request, reply) =>
      reply
        .type("text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="rueckmeldungen.csv"')
        .send(rsvp.csv()),
  );

  app.post(
    "/api/admin/rsvp/remind",
    {
      ...adminFeature,
      schema: {
        querystring: noQuery,
        body: noBody,
        response: { 200: remindResponseSchema },
      },
    },
    async (request, reply) => {
      if (!mailer) {
        return sendError(reply, 503, {
          code: "mail_unavailable",
          message: "This installation cannot send email.",
        });
      }
      // Counted before the first mail, per event: a double click or a second admin is refused.
      const wait = limiter.hit(`rsvp-remind:${event.eventId}`, RSVP_REMIND_PER_EVENT);
      if (wait !== undefined) return rateLimited(reply, wait);
      const result = await rsvp.remind(mailer, publicUrl, actor(request), (error) => {
        request.log.error({ err: error }, "sending a reminder failed");
      });
      return await reply.send(result);
    },
  );

  // The wizard in admin mode: the deadline does not apply (RSVP-04).
  app.get(
    "/api/admin/rsvp/guests/:id",
    {
      ...adminFeature,
      schema: { querystring: noQuery, params: idParams, response: { 200: rsvpStateSchema } },
    },
    async (request, reply) => {
      try {
        return await reply.send(rsvp.state(request.params.id));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/admin/rsvp/guests/:id",
    {
      ...adminFeature,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: rsvpAnswerRequestSchema,
        response: { 200: rsvpStateSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(rsvp.answer(request.params.id, request.body, actor(request), true));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // --- Übersicht: the card "Zuletzt" (DATA-05) --------------------------------------------
  app.get(
    "/api/admin/activity",
    { ...admin, schema: { querystring: noQuery, response: { 200: activityResponseSchema } } },
    () => ({ entries: activity.latest(5) }),
  );

  return Promise.resolve();
};

export const rsvpRoutes = fp(rsvpPlugin, { name: "rsvp" });
