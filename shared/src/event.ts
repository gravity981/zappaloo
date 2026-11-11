// The event of an installation (sw-architecture.md 19): its setup data and the API
// representation with the current toggles.
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
export const featureNameSchema = z.enum(FEATURE_NAMES);

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

/** The id of the event: an installation serves exactly one (CFG-04, 19.3). */
export const EVENT_ID = "event1";

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
const nameSchema = z.string().trim().min(1).max(200);
const languageSchema = z.string().regex(/^[a-z]{2}$/, "must be a two-letter language code");

/** The defaults a new event starts with (19.3): all features on, platform and uploads closed. */
export const DEFAULT_FEATURES: Features = {
  minigames: true,
  snapshots: true,
  gallery: true,
  keepsakes: true,
  rsvp: true,
  treasureHunt: true,
  eventScreen: true,
};
export const DEFAULT_SETTINGS: Settings = {
  platformOpen: false,
  snapshotUploadsOpen: false,
  keepsakeUploadsOpen: false,
};

/** `POST /api/admin/event/setup` (CFG-02): what the admin fills in once. */
export const eventSetupSchema = z.strictObject({
  name: nameSchema,
  timezone: timezoneSchema,
  defaultLanguage: languageSchema,
});
export type EventSetup = z.infer<typeof eventSetupSchema>;

/**
 * `GET /api/event`: the event with its current features and settings. Name, time zone and
 * language are null until the setup is complete (19.3.1).
 */
export const eventResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  timezone: z.string().nullable(),
  defaultLanguage: z.string().nullable(),
  setupComplete: z.boolean(),
  features: featuresSchema,
  settings: settingsSchema,
});
export type EventResponse = z.infer<typeof eventResponseSchema>;

/**
 * `PATCH /api/admin/event` (CFG-05, CFG-06): what to change; what is left out stays as it is.
 * At least one value.
 */
export const eventUpdateSchema = z
  .strictObject({
    name: nameSchema.optional(),
    timezone: timezoneSchema.optional(),
    defaultLanguage: languageSchema.optional(),
    features: featuresSchema.partial().optional(),
    settings: settingsSchema.partial().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value.features ?? {}).length +
        Object.keys(value.settings ?? {}).length +
        [value.name, value.timezone, value.defaultLanguage].filter((x) => x !== undefined).length >
      0,
    { message: "name at least one value to change" },
  );
export type EventUpdate = z.infer<typeof eventUpdateSchema>;
