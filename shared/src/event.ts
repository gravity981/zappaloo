// The event of an installation (sw-architecture.md 19): the `event.json` of its
// bootstrap directory and the API representation with the current toggles.
import { z } from "zod";

/** Features an event can switch on or off (CFG-03). */
export const FEATURE_NAMES = [
  "minigames",
  "snapshots",
  "gallery",
  "keepsakes",
  "rsvp",
  "treasureHunt",
  "eventScreen",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Settings the admin changes at runtime (CFG-05). */
export const SETTING_NAMES = [
  "platformOpen",
  "snapshotUploadsOpen",
  "keepsakeUploadsOpen",
] as const;
export type SettingName = (typeof SETTING_NAMES)[number];

const featuresSchema = z.strictObject({
  minigames: z.boolean(),
  snapshots: z.boolean(),
  gallery: z.boolean(),
  keepsakes: z.boolean(),
  rsvp: z.boolean(),
  treasureHunt: z.boolean(),
  eventScreen: z.boolean(),
});
export type Features = z.infer<typeof featuresSchema>;

const settingsSchema = z.strictObject({
  platformOpen: z.boolean(),
  snapshotUploadsOpen: z.boolean(),
  keepsakeUploadsOpen: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** Lower-case words joined by hyphens: also safe as a directory name. */
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lower-case letters and digits separated by hyphens")
  .max(64);
export const eventSlugSchema = slugSchema;

const timezoneSchema = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "is not a valid IANA time zone, e.g. Europe/Zurich" },
);

/** `events/<slug>/event.json`; values in `features` and `settings` are initial values. */
export const eventConfigSchema = z.strictObject({
  id: slugSchema,
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  timezone: timezoneSchema,
  defaultLanguage: z.string().regex(/^[a-z]{2}$/, "must be a two-letter language code"),
  theme: z.strictObject({
    config: z.string().regex(/^[A-Za-z0-9._-]+\.json$/, "must be the name of a .json file"),
  }),
  features: featuresSchema,
  settings: settingsSchema,
});
export type EventConfig = z.infer<typeof eventConfigSchema>;

/** `GET /api/event`: the event with its current features and settings. */
export const eventResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  defaultLanguage: z.string(),
  features: featuresSchema,
  settings: settingsSchema,
});
export type EventResponse = z.infer<typeof eventResponseSchema>;
