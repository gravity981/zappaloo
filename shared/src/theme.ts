// The theme package (sw-architecture.md 19.7, THM-01 – THM-06): the format version 1 of
// `manifest.json` and `theme.json`, and the limits of the validator. Shared, so the admin area and the
// guest pages read the same shapes.
import { z } from "zod";

/** The format versions the platform reads (THM-02). */
export const THEME_FORMAT_VERSIONS = [1] as const;

export const THEME_KIND = "zappaloo-theme";

/** The limits of a package (19.7). */
export const THEME_LIMITS = {
  archiveBytes: 10 * 1024 * 1024,
  unpackedBytes: 20 * 1024 * 1024,
  fontBytes: 2 * 1024 * 1024,
  fontCount: 8,
  /** The contrast that text on a background, and text on an accent, must reach (WCAG AA). */
  contrast: 4.5,
} as const;

/** The seven colours of `theme.json`, in their order (19.7). */
export const THEME_COLOR_KEYS = [
  "background",
  "surface",
  "text",
  "muted",
  "line",
  "accent",
  "onAccent",
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export const themeManifestSchema = z.strictObject({
  kind: z.literal(THEME_KIND),
  formatVersion: z.literal(1),
  name: z.string().trim().min(1).max(60),
});
export type ThemeManifest = z.infer<typeof themeManifestSchema>;

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour as #rrggbb");

const fontFileSchema = z.strictObject({
  file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.woff2$/),
  weight: z
    .number()
    .int()
    .min(100)
    .max(900)
    .refine((weight) => weight % 100 === 0, "a weight in steps of 100"),
  style: z.enum(["normal", "italic"]),
});

const fontSchema = z.strictObject({
  family: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N} -]{1,40}$/u, "letters, digits, spaces and hyphens"),
  files: z.array(fontFileSchema).min(1).max(4),
});
export type ThemeFont = z.infer<typeof fontSchema>;

export const themeJsonSchema = z.strictObject({
  colors: z.strictObject(
    Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, colorSchema])) as Record<
      ThemeColorKey,
      typeof colorSchema
    >,
  ),
  fonts: z
    .strictObject({
      body: fontSchema.optional(),
      heading: fontSchema.optional(),
      display: fontSchema.optional(),
    })
    .optional(),
});
export type ThemeJson = z.infer<typeof themeJsonSchema>;
