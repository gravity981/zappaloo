// Schemas of the system endpoints, shared by backend and frontend.
import { z } from "zod";

export const versionResponseSchema = z.object({
  /** Version according to the version scheme (sw-architecture.md 23.1, 23.6). */
  version: z.string(),
  /** Commit the build was made from; "unknown" when running from source without git. */
  commit: z.string(),
});
export type VersionResponse = z.infer<typeof versionResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
