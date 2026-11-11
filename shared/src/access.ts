// Access conditions (ACS-05, ACS-06; sw-architecture.md 11): what a protected area, page
// or function demands of the signed-in user. A condition is data, so it can be stored with
// whatever it protects and is evaluated on the server.
import { z } from "zod";
import { roleSchema } from "./account.ts";
import { featureNameSchema } from "./event.ts";

/** Key of a manual release: the admin switches it on and off by name. */
export const releaseKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,59}$/, "must be 1-60 characters: a-z, 0-9, underscore, hyphen");

const leafSchema = z.discriminatedUnion("type", [
  /** The user has the role (no role implies another, ROLE-08). */
  z.strictObject({ type: z.literal("role"), role: roleSchema }),
  /** The user is in the guest group with this name. */
  z.strictObject({ type: z.literal("group"), group: z.string().trim().min(1).max(60) }),
  /** Time-based unlock: from the time on, and/or until the time. */
  z
    .strictObject({
      type: z.literal("time"),
      from: z.iso.datetime().optional(),
      until: z.iso.datetime().optional(),
    })
    .refine((value) => value.from !== undefined || value.until !== undefined, {
      message: "needs from or until",
    }),
  /** Manual release by an admin. */
  z.strictObject({ type: z.literal("release"), key: releaseKeySchema }),
  /** The feature is switched on for the event. */
  z.strictObject({ type: z.literal("feature"), feature: featureNameSchema }),
]);

export type AccessLeaf = z.infer<typeof leafSchema>;

/** Conditions nest at most this deep, so a stored condition stays readable and cheap to check. */
export const MAX_CONDITION_DEPTH = 4;

/**
 * `{ all: [...] }` needs every part (AND, the default), `{ any: [...] }` one of them (an
 * explicit OR). Parts are leaves or further `all`/`any`.
 */
export type AccessCondition = AccessLeaf | { all: AccessCondition[] } | { any: AccessCondition[] };

function conditionSchemaAt(depth: number): z.ZodType<AccessCondition> {
  if (depth >= MAX_CONDITION_DEPTH) return leafSchema;
  const inner = z.lazy(() => conditionSchemaAt(depth + 1));
  return z.union([
    leafSchema,
    z.strictObject({ all: z.array(inner).max(20) }),
    z.strictObject({ any: z.array(inner).max(20) }),
  ]);
}

export const accessConditionSchema: z.ZodType<AccessCondition> = conditionSchemaAt(0);

/** `GET /api/admin/releases`: the manual releases that are switched on. */
export const releaseListSchema = z.object({
  releases: z.array(z.object({ key: z.string(), releasedAt: z.string() })),
});
export type ReleaseList = z.infer<typeof releaseListSchema>;
