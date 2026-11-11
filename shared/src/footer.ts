// The footer: the copyright line, the license page and the repository link (sw-architecture.md
// 19.6; LIC-01 – LIC-03).
import { z } from "zod";

/** The longest copyright line the admin can save. */
export const COPYRIGHT_MAX_LENGTH = 120;

/** Plain text on one line: no control characters (newlines included). */
export const copyrightSchema = z
  .string()
  .trim()
  .max(COPYRIGHT_MAX_LENGTH)
  .regex(/^[^\p{Cc}]*$/u, "one line of text");

/** `GET /api/admin/footer`: the line as the admin edits it. */
export const footerConfigSchema = z.object({
  /** The line in use; empty when it is hidden. */
  copyright: z.string(),
  /** Whether the admin has edited it (otherwise it is the default). */
  custom: z.boolean(),
  /** What "Zurücksetzen" goes back to; null before the event has a name. */
  defaultCopyright: z.string().nullable(),
});
export type FooterConfig = z.infer<typeof footerConfigSchema>;

/** `PUT /api/admin/footer`: a new line ("" hides it), or `null` for the default. */
export const footerUpdateSchema = z.strictObject({ copyright: copyrightSchema.nullable() });
export type FooterUpdate = z.infer<typeof footerUpdateSchema>;

/** `GET /api/license` (public): the license text of the running version. */
export const licenseResponseSchema = z.object({ text: z.string() });
export type LicenseResponse = z.infer<typeof licenseResponseSchema>;
