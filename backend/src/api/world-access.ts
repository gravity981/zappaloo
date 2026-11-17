// The guests' door to the world (MAP-19): while guest access is off, the routes that serve the world answer guests
// with 403. Staff and admins pass, as the active package and admin management stay available.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { WorldService } from "../world/service.ts";

/** `preHandler`: 403 `world_access_disabled` for a user who is neither staff nor admin while guest access is off. */
export function worldGuestAccess(world: WorldService) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> => {
    const roles = request.auth?.user.roles ?? [];
    if (roles.includes("staff") || roles.includes("admin")) return undefined;
    // Without a world there is nothing to hide: the answer is the usual null.
    if (world.active() === undefined || world.guestAccess()) return undefined;
    return reply.status(403).send({
      error: {
        code: "world_access_disabled",
        message: "guest access to the world is switched off",
      },
    });
  };
}
