// Error body returned by every API endpoint.
import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    /** Machine-readable code, e.g. "validation_failed", "not_found". */
    code: z.string(),
    message: z.string(),
    /** For validation errors: one entry per invalid field. */
    issues: z
      .array(z.object({ location: z.string(), path: z.string(), message: z.string() }))
      .optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
